/**
 * End-to-end check for the shared question answers.
 *
 * Usage: node scripts/e2e-answers.mjs http://127.0.0.1:3123
 * Requires ADMIN_PASSWORD in the environment, matching the running server.
 */

const base = process.argv[2] ?? "http://127.0.0.1:3123";
const adminPassword = process.env.ADMIN_PASSWORD;

let passed = 0;
let failed = 0;

function check(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  [OK]   ${label}`);
  } else {
    failed += 1;
    console.log(`  [실패] ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function json(path, init) {
  const response = await fetch(`${base}${path}`, init);
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

function post(path, payload, headers = {}) {
  return json(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
}

if (!adminPassword) {
  console.error("ADMIN_PASSWORD 환경변수가 필요합니다.");
  process.exit(1);
}

console.log(`\n🗣️  오늘의 질문 답변 공유 E2E → ${base}\n`);

// --- 준비: 전원 제출 후 배정 ------------------------------------------------
const roster = (await json("/api/roster")).body.users;
check("명단 36명", roster.length === 36, `${roster.length}명`);

await Promise.all(
  roster.map((user, index) =>
    post("/api/submit", {
      userId: user.id,
      menuChoice: index % 2 === 0 ? "menu-a" : "menu-b",
      eatingSpeed: ["SLOW", "NORMAL", "FAST"][index % 3],
    }),
  ),
);

const loginResponse = await fetch(`${base}/api/admin/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password: adminPassword }),
});
check("관리자 로그인", loginResponse.status === 200);
const setCookie = loginResponse.headers.get("set-cookie") ?? "";
const adminCookie = setCookie.split(";")[0];
check("관리자 쿠키 발급", adminCookie.startsWith("lm_admin="), setCookie.slice(0, 40));

const assign = await post("/api/admin/assign", {}, { cookie: adminCookie });
check("배정 실행", assign.status === 200, `status=${assign.status}`);

// --- 같은 조 두 사람 찾기 ---------------------------------------------------
const results = await Promise.all(
  roster.map(async (user) => {
    const { body } = await json(`/api/result?userId=${encodeURIComponent(user.id)}`);
    return { user, groupNumber: body.groupNumber };
  }),
);
const byGroup = new Map();
for (const row of results) {
  const list = byGroup.get(row.groupNumber) ?? [];
  list.push(row.user);
  byGroup.set(row.groupNumber, list);
}
const table = [...byGroup.values()].find((members) => members.length >= 2);
check("같은 조 2명 이상 확보", Boolean(table), `조 수=${byGroup.size}`);

const [me, mate, ...rest] = table;

// --- 공개 게이트 ------------------------------------------------------------
let board = (await json(`/api/answers?userId=${encodeURIComponent(me.id)}`)).body;
check("배정 후 게시판 준비됨", board.ready === true);
check("질문 존재", typeof board.question === "string" && board.question.length > 0);
check("처음에는 비공개", board.revealed === false);
check("처음에는 답변 0건", (board.answers ?? []).length === 0);
check("내 답변 없음", board.myAnswer === null);

// 조원이 먼저 답한다.
const mateAnswer = await post("/api/answers", {
  userId: mate.id,
  content: "연수원에서 만난 동기들이랑 다시 밥 먹는 거요",
});
check("조원 답변 등록", mateAnswer.status === 200, `status=${mateAnswer.status}`);

board = (await json(`/api/answers?userId=${encodeURIComponent(me.id)}`)).body;
check("아직 안 쓴 사람에게는 여전히 비공개", board.revealed === false);
check("남의 답변 내용이 새지 않음", (board.answers ?? []).length === 0);
check("답변한 인원수는 보임", board.answeredCount === 1, `answeredCount=${board.answeredCount}`);

// 내가 답하면 공개된다.
const mine = await post("/api/answers", {
  userId: me.id,
  content: "점심 메뉴 고민 안 해도 되는 거요",
});
check("내 답변 등록", mine.status === 200, `status=${mine.status}`);
check("등록 응답이 곧바로 공개 상태", mine.body.revealed === true);
check("등록 응답에 조원 답변 포함", (mine.body.answers ?? []).length === 2);

board = (await json(`/api/answers?userId=${encodeURIComponent(me.id)}`)).body;
check("공개 전환", board.revealed === true);
check("조원 답변 2건 노출", (board.answers ?? []).length === 2);
check(
  "조원 답변 내용 일치",
  (board.answers ?? []).some((a) => a.content.includes("연수원에서 만난 동기들")),
);
check(
  "내 답변에 isMine 표시",
  (board.answers ?? []).filter((a) => a.isMine).length === 1,
);
check(
  "이름이 함께 노출됨",
  (board.answers ?? []).every((a) => typeof a.name === "string" && a.name.length > 0),
);

// --- 수정 -------------------------------------------------------------------
const edited = await post("/api/answers", {
  userId: me.id,
  content: "고쳐 쓴 답변입니다",
});
check("답변 수정 허용", edited.status === 200);
board = (await json(`/api/answers?userId=${encodeURIComponent(me.id)}`)).body;
check("수정 후에도 총 2건 (중복 생성 없음)", (board.answers ?? []).length === 2);
check(
  "수정 내용 반영",
  (board.answers ?? []).some((a) => a.isMine && a.content === "고쳐 쓴 답변입니다"),
);
check("myAnswer 갱신", board.myAnswer === "고쳐 쓴 답변입니다");

// --- 검증 -------------------------------------------------------------------
const empty = await post("/api/answers", { userId: me.id, content: "   " });
check("빈 답변 거부", empty.status === 400, `status=${empty.status}`);

const tooLong = await post("/api/answers", { userId: me.id, content: "가".repeat(301) });
check("300자 초과 거부", tooLong.status === 400, `status=${tooLong.status}`);

const noUser = await post("/api/answers", { content: "이름 없음" });
check("사용자 없이 제출 거부", noUser.status === 400);

const stranger = await post("/api/answers", { userId: "not-a-real-user", content: "침입" });
check("명단에 없는 사람 거부", stranger.status === 409, `status=${stranger.status}`);

// --- 다른 조와 섞이지 않는지 ------------------------------------------------
const otherTable = [...byGroup.entries()].find(
  ([groupNumber]) => groupNumber !== results.find((r) => r.user.id === me.id).groupNumber,
);
if (otherTable) {
  const outsider = otherTable[1][0];
  await post("/api/answers", { userId: outsider.id, content: "다른 조 답변" });
  board = (await json(`/api/answers?userId=${encodeURIComponent(me.id)}`)).body;
  check(
    "다른 조 답변이 섞이지 않음",
    !(board.answers ?? []).some((a) => a.content === "다른 조 답변"),
  );
  check("내 조 답변 수 유지", (board.answers ?? []).length === 2);
}

// 조원 전원이 답하지 않은 상태의 카운트가 정확한지
check(
  "answeredCount ≤ memberCount",
  board.answeredCount <= board.memberCount,
  `${board.answeredCount}/${board.memberCount}`,
);
if (rest.length > 0) {
  check("아직 안 쓴 사람이 남아 있음", board.answeredCount < board.memberCount);
}

// --- 관리자 강제 공개 -------------------------------------------------------
board = (await json(`/api/answers?userId=${encodeURIComponent(me.id)}`)).body;
check("전원 답변 전에는 미션 잠김", board.missionUnlocked === false);

const unlockUnauthed = await post("/api/admin/missions", { unlocked: true });
check("미인증 강제 공개 차단", unlockUnauthed.status === 401, `status=${unlockUnauthed.status}`);

const unlock = await post("/api/admin/missions", { unlocked: true }, { cookie: adminCookie });
check("관리자 강제 공개", unlock.status === 200, `status=${unlock.status}`);

board = (await json(`/api/answers?userId=${encodeURIComponent(me.id)}`)).body;
check("강제 공개 후 미션 열림", board.missionUnlocked === true);
check("강제 공개 표시", board.missionForced === true);

const relock = await post("/api/admin/missions", { unlocked: false }, { cookie: adminCookie });
check("자동 조건으로 되돌리기", relock.status === 200);
board = (await json(`/api/answers?userId=${encodeURIComponent(me.id)}`)).body;
check("되돌린 뒤 다시 잠김", board.missionUnlocked === false);

// --- 미션 해제 조건: 조원 전원 답변 --------------------------------------
for (const member of rest) {
  await post("/api/answers", { userId: member.id, content: `${member.name}의 답변` });
}
board = (await json(`/api/answers?userId=${encodeURIComponent(me.id)}`)).body;
check(
  "전원 답변 시 answeredCount === memberCount (미션 해제 조건)",
  board.answeredCount === board.memberCount,
  `${board.answeredCount}/${board.memberCount}`,
);
check(
  "전원 답변이 모두 노출됨",
  (board.answers ?? []).length === board.memberCount,
  `${(board.answers ?? []).length}건`,
);
check("전원 답변 시 미션 자동 해제", board.missionUnlocked === true);
check("자동 해제는 강제 표시 없음", board.missionForced === false);

console.log(`\n결과: ${passed} passed / ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
