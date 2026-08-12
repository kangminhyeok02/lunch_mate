/**
 * 이틀차 리허설: 오늘 배정 결과를 "어제"로 옮긴 뒤 다시 배정해서,
 * 이전에 같은 조였던 사람이 실제로 흩어지는지 확인한다.
 *
 * 알고리즘의 1순위(이전 조 중복 최소화)는 이력이 있어야만 검증된다.
 *
 *   node scripts/simulate-day2.mjs --url=http://localhost:3001
 */

import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BASE = value("url", "http://localhost:3000");

async function loadEnv() {
  const raw = await readFile(".env", "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

await loadEnv();

const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const yesterday = new Date(`${today}T00:00:00Z`);
yesterday.setUTCDate(yesterday.getUTCDate() - 1);
const yesterdayDate = yesterday.toISOString().slice(0, 10);

function pairsOf(memberIds) {
  const out = [];
  for (let i = 0; i < memberIds.length; i += 1) {
    for (let j = i + 1; j < memberIds.length; j += 1) {
      const [a, b] = [memberIds[i], memberIds[j]].sort();
      out.push(`${a}|${b}`);
    }
  }
  return out;
}

async function readGroups(date) {
  const { data, error } = await client
    .from("lunch_groups")
    .select("group_number, lunch_group_members(user_id)")
    .eq("date", date)
    .order("group_number");
  if (error) throw new Error(error.message);
  return data.map((g) => g.lunch_group_members.map((m) => m.user_id));
}

console.log(`\n🍚 이틀차 리허설\n`);

// 1. 오늘 결과를 어제 이력으로 옮긴다.
const dayOne = await readGroups(today);
if (dayOne.length === 0) {
  console.error("❌ 오늘 배정 결과가 없습니다. 먼저 simulate.mjs --assign 을 실행하세요.");
  process.exit(1);
}

await client.from("lunch_groups").delete().eq("date", yesterdayDate);
await client.from("lunch_days").upsert(
  { date: yesterdayDate, status: "ASSIGNED" },
  { onConflict: "date" },
);
await client.from("lunch_groups").insert(
  dayOne.map((_, i) => ({
    id: `${yesterdayDate}-g${String(i + 1).padStart(2, "0")}`,
    date: yesterdayDate,
    group_number: i + 1,
    matching_points: [],
  })),
);
await client.from("lunch_group_members").insert(
  dayOne.flatMap((members, i) =>
    members.map((user_id) => ({
      group_id: `${yesterdayDate}-g${String(i + 1).padStart(2, "0")}`,
      user_id,
    })),
  ),
);
console.log(`어제(${yesterdayDate}) 이력으로 ${dayOne.length}개 조를 기록했습니다.`);

// 2. 오늘을 초기화하고 다시 제출 + 배정.
console.log(`\n둘째 날 제출 및 배정 중...\n`);
spawnSync(
  process.execPath,
  ["scripts/simulate.mjs", `--url=${BASE}`, "--reset", "--assign", "--seed=day-two"],
  { stdio: ["inherit", "ignore", "inherit"] },
);

// 3. 겹치는 짝이 얼마나 되는지 센다.
const dayTwo = await readGroups(today);
const beforePairs = new Set(dayOne.flatMap(pairsOf));
const afterPairs = dayTwo.flatMap(pairsOf);
const repeats = afterPairs.filter((p) => beforePairs.has(p));

const names = new Map(
  (await client.from("users").select("id, name")).data.map((u) => [u.id, u.name]),
);

console.log(`${"=".repeat(52)}`);
console.log(`어제 만들어진 짝    : ${beforePairs.size}쌍`);
console.log(`오늘 만들어진 짝    : ${afterPairs.length}쌍`);
console.log(`다시 만난 짝        : ${repeats.length}쌍`);
console.log(`새로 만난 사람 비율 : ${Math.round((1 - repeats.length / afterPairs.length) * 100)}%`);
console.log("=".repeat(52));

if (repeats.length > 0) {
  console.log("\n다시 만난 짝:");
  for (const pair of repeats) {
    const [a, b] = pair.split("|");
    console.log(`  ${names.get(a) ?? a} ↔ ${names.get(b) ?? b}`);
  }
} else {
  console.log("\n✅ 어제 같은 조였던 사람이 오늘 다시 만난 경우가 하나도 없습니다.");
}

console.log(`\n정리하려면: node scripts/reset-day.mjs ${yesterdayDate}\n`);
