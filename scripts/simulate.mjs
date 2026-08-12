/**
 * 행사 리허설: 36명이 실제로 제출한 것처럼 만들어 준다.
 *
 * 기본 동작은 "제출까지만" — 배정은 관리자가 /admin 에서 직접 누르는 흐름을
 * 그대로 확인할 수 있도록 일부러 남겨둔다.
 *
 *   node scripts/simulate.mjs                  36명 제출
 *   node scripts/simulate.mjs --reset          오늘 데이터 지우고 다시 제출
 *   node scripts/simulate.mjs --assign         제출 + 배정까지 자동
 *   node scripts/simulate.mjs --seed=abc       다른 선호 조합으로
 *   node scripts/simulate.mjs --url=http://localhost:3000
 */

import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const flag = (name) => args.some((a) => a === `--${name}`);
const value = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const BASE = value("url", "http://localhost:3000");
const SEED = value("seed", "rehearsal");
const DO_RESET = flag("reset");
const DO_ASSIGN = flag("assign");

async function loadEnv() {
  try {
    const raw = await readFile(".env", "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {
    // 이미 export 되어 있을 수 있다.
  }
}

await loadEnv();

// 같은 seed면 같은 선호 분포가 나오도록 — 리허설을 반복 재현할 수 있게.
function createRng(seedText) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedText.length; i += 1) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, rng) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function api(path, init) {
  const response = await fetch(`${BASE}${path}`, init);
  let body = null;
  try {
    body = await response.json();
  } catch {
    // 본문 없는 응답도 있다.
  }
  return { status: response.status, body };
}

async function main() {
  console.log(`\n🍚 LUNCH MATE 리허설 → ${BASE}\n`);

  if (DO_RESET) {
    const { spawnSync } = await import("node:child_process");
    spawnSync(process.execPath, ["scripts/reset-day.mjs"], { stdio: "inherit" });
  }

  const roster = await api("/api/roster");
  if (roster.status !== 200) {
    console.error(`❌ 서버에 연결할 수 없습니다 (status ${roster.status}).`);
    console.error(`   먼저 다른 터미널에서 \`npm run dev\` 를 실행하세요.`);
    process.exit(1);
  }

  const users = roster.body.users;
  const status = await api("/api/status");
  const menus = status.body.menus;

  console.log(`참가자 ${users.length}명 · 메뉴: ${menus.map((m) => `${m.emoji} ${m.name}`).join(" / ")}\n`);

  // 스펙 15절의 예시 분포를 흉내낸다: 메뉴 20/16, 속도 7/22/7.
  // 메뉴가 4로 나누어떨어지지 않는 상황을 일부러 만들어 본다.
  const rng = createRng(SEED);
  const order = shuffle(users, rng);

  const menuPlan = order.map((_, i) => (i < 20 ? menus[0].id : menus[1].id));
  const speedPlan = order.map((_, i) => (i < 7 ? "SLOW" : i < 29 ? "NORMAL" : "FAST"));

  const plan = order.map((user, i) => ({
    user,
    menuChoice: menuPlan[i],
    eatingSpeed: speedPlan[i],
  }));

  // 36명이 동시에 누르는 상황을 그대로 재현.
  const results = await Promise.all(
    plan.map((p) =>
      api("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: p.user.id,
          menuChoice: p.menuChoice,
          eatingSpeed: p.eatingSpeed,
        }),
      }),
    ),
  );

  const ok = results.filter((r) => r.status === 200).length;
  const dup = results.filter((r) => r.status === 409).length;
  console.log(`제출 완료 : ${ok}명`);
  if (dup > 0) console.log(`이미 제출 : ${dup}명 (--reset 을 쓰면 초기화됩니다)`);

  const after = await api("/api/status");
  console.log(`참여 현황 : ${after.body.submittedCount} / ${after.body.totalCount}`);
  console.log(`상태      : ${after.body.status}\n`);

  const menuTally = menus.map((m) => ({
    name: `${m.emoji} ${m.name}`,
    count: plan.filter((p) => p.menuChoice === m.id).length,
  }));
  const speedTally = ["SLOW", "NORMAL", "FAST"].map((s) => ({
    name: { SLOW: "🐢 느림", NORMAL: "🙂 보통", FAST: "⚡ 빠름" }[s],
    count: plan.filter((p) => p.eatingSpeed === s).length,
  }));
  console.log("메뉴 선호 : " + menuTally.map((m) => `${m.name} ${m.count}명`).join("  |  "));
  console.log("식사 속도 : " + speedTally.map((s) => `${s.name} ${s.count}명`).join("  |  "));

  if (!DO_ASSIGN) {
    console.log(`\n👉 이제 ${BASE}/admin 에서 "점심조 배정 시작"을 눌러보세요.`);
    console.log(`   (배정까지 자동으로 하려면 --assign 을 붙이세요)\n`);
    return;
  }

  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.error("\n❌ ADMIN_PASSWORD 가 없어서 배정을 실행할 수 없습니다.");
    process.exit(1);
  }

  const login = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (login.status !== 200) {
    console.error(`\n❌ 관리자 로그인 실패 (status ${login.status}). ADMIN_PASSWORD 를 확인하세요.`);
    process.exit(1);
  }
  const cookie = login.headers.getSetCookie?.().join("; ") ?? login.headers.get("set-cookie") ?? "";

  const assign = await api("/api/admin/assign", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({}),
  });
  if (assign.status !== 200) {
    console.error(`\n❌ 배정 실패: ${JSON.stringify(assign.body)}`);
    process.exit(1);
  }

  await printTables(cookie);
}

async function printTables(cookie) {
  const summary = await api("/api/admin/summary", { headers: { Cookie: cookie } });
  const groups = summary.body.groups;

  console.log(`\n${"=".repeat(52)}`);
  console.log(`배정 결과 — ${groups.length}개 조`);
  console.log("=".repeat(52));

  for (const group of groups) {
    console.log(`\nTABLE ${String(group.groupNumber).padStart(2, "0")}   ${group.members.join(" · ")}`);
    console.log(`  💬 ${group.question}`);
    console.log(`  🎯 ${group.mission}`);
    const labels = {
      SAME_MENU: "같은 메뉴",
      SIMILAR_SPEED: "비슷한 속도",
      ALL_NEW_FACES: "전원 초면",
    };
    console.log(`  💡 ${group.matchingPoints.map((p) => labels[p]).join(", ") || "—"}`);
  }

  const seated = groups.flatMap((g) => g.members);
  console.log(`\n${"=".repeat(52)}`);
  console.log(`착석 인원 : ${seated.length}명 (중복 없음: ${new Set(seated).size === seated.length})`);
  console.log(`조별 인원 : ${groups.map((g) => g.members.length).join(", ")}`);
  console.log(`\n👉 참가자 화면은 ${BASE} 에서 본인 이름을 고르면 결과가 보입니다.\n`);
}

main().catch((error) => {
  console.error("시뮬레이션 실패:", error);
  process.exit(1);
});
