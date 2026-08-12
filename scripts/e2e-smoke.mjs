/**
 * End-to-end smoke test against a running server.
 *
 * Drives the real HTTP surface the way 36 phones would: everyone submits,
 * duplicates get rejected, an unauthenticated caller cannot trigger assignment,
 * the admin assigns, and every participant can read their own table back.
 *
 * Usage: node scripts/e2e-smoke.mjs [baseUrl]
 */

const BASE = process.argv[2] ?? "http://127.0.0.1:3123";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "test-admin-pw";

let failures = 0;

function check(label, condition, detail = "") {
  const mark = condition ? "PASS" : "FAIL";
  if (!condition) failures += 1;
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ""}`);
}

async function json(path, init) {
  const response = await fetch(`${BASE}${path}`, init);
  let body = null;
  try {
    body = await response.json();
  } catch {
    // Some responses legitimately have no body.
  }
  return { status: response.status, body, headers: response.headers };
}

async function main() {
  console.log(`\nLUNCH MATE end-to-end smoke test → ${BASE}\n`);

  console.log("1. Roster");
  const roster = await json("/api/roster");
  check("roster endpoint responds", roster.status === 200, `status ${roster.status}`);
  const users = roster.body?.users ?? [];
  check("roster has 36 people", users.length === 36, `got ${users.length}`);
  check("every person has a unique id", new Set(users.map((u) => u.id)).size === users.length);

  console.log("\n2. Menus");
  const status0 = await json("/api/status");
  check("exactly two menus offered", status0.body?.menus?.length === 2);
  const menus = status0.body?.menus ?? [];

  console.log("\n3. Validation rejects incomplete submissions");
  const noName = await json("/api/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ menuChoice: menus[0]?.id, eatingSpeed: "FAST" }),
  });
  check("missing name is rejected", noName.status === 400, `status ${noName.status}`);

  const noMenu = await json("/api/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: users[0].id, eatingSpeed: "FAST" }),
  });
  check("missing menu is rejected", noMenu.status === 400, `status ${noMenu.status}`);

  const badSpeed = await json("/api/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: users[0].id, menuChoice: menus[0].id, eatingSpeed: "TURBO" }),
  });
  check("invalid eating speed is rejected", badSpeed.status === 400, `status ${badSpeed.status}`);

  console.log("\n4. Unauthenticated admin access");
  const assignAnon = await json("/api/admin/assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  check("assignment rejects anonymous caller", assignAnon.status === 401, `status ${assignAnon.status}`);

  const summaryAnon = await json("/api/admin/summary");
  check("summary rejects anonymous caller", summaryAnon.status === 401, `status ${summaryAnon.status}`);

  const badLogin = await json("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "definitely-wrong" }),
  });
  check("wrong admin password is rejected", badLogin.status === 401, `status ${badLogin.status}`);

  console.log("\n5. All 36 people submit at once");
  const speeds = ["SLOW", "NORMAL", "FAST"];
  const submissions = await Promise.all(
    users.map((user, index) =>
      json("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          menuChoice: menus[index % 3 === 0 ? 1 : 0].id,
          eatingSpeed: speeds[index % speeds.length],
        }),
      }),
    ),
  );
  check(
    "all 36 submissions accepted",
    submissions.every((r) => r.status === 200),
    `${submissions.filter((r) => r.status === 200).length}/36`,
  );

  const afterSubmit = await json("/api/status");
  check(
    "submitted count is 36",
    afterSubmit.body?.submittedCount === 36,
    `got ${afterSubmit.body?.submittedCount}`,
  );
  check(
    "status advanced to READY_TO_ASSIGN",
    afterSubmit.body?.status === "READY_TO_ASSIGN",
    `got ${afterSubmit.body?.status}`,
  );

  console.log("\n6. Duplicate submission");
  const duplicate = await json("/api/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: users[0].id,
      menuChoice: menus[0].id,
      eatingSpeed: "SLOW",
    }),
  });
  check("second submission is rejected with 409", duplicate.status === 409, `status ${duplicate.status}`);
  const stillThirtySix = await json("/api/status");
  check("count is still 36 after duplicate", stillThirtySix.body?.submittedCount === 36);

  console.log("\n7. Result before assignment");
  const early = await json(`/api/result?userId=${encodeURIComponent(users[0].id)}`);
  check("result not ready before assignment", early.body?.ready === false);

  console.log("\n8. Admin logs in and assigns");
  const login = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  check("admin login succeeds", login.status === 200, `status ${login.status}`);
  const cookie = login.headers.getSetCookie?.().join("; ") ?? login.headers.get("set-cookie") ?? "";
  check("admin cookie issued", cookie.includes("lm_admin"));
  check("admin cookie is httpOnly", cookie.toLowerCase().includes("httponly"));

  const assign = await json("/api/admin/assign", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({}),
  });
  check("assignment succeeds", assign.status === 200, `status ${assign.status}`);
  check("nine tables created", assign.body?.groupCount === 9, `got ${assign.body?.groupCount}`);

  console.log("\n9. Everyone can read their table");
  const results = await Promise.all(
    users.map((user) => json(`/api/result?userId=${encodeURIComponent(user.id)}`)),
  );
  check("all 36 results ready", results.every((r) => r.body?.ready === true));
  check(
    "every table has four members",
    results.every((r) => r.body?.members?.length === 4),
  );
  check(
    "everyone sees their own name in their table",
    results.every((r, i) => r.body?.members?.includes(users[i].name)),
  );
  check("every table has a question", results.every((r) => Boolean(r.body?.question)));
  check("every table has a mission", results.every((r) => Boolean(r.body?.mission)));
  check(
    "matching points are shown",
    results.every((r) => Array.isArray(r.body?.matchingPoints)),
  );
  check(
    "no internal score leaks to users",
    results.every((r) => !JSON.stringify(r.body).includes("score")),
  );

  const tables = new Map();
  results.forEach((r) => {
    const key = r.body.groupNumber;
    tables.set(key, r.body.members.join("|"));
  });
  check("nine distinct tables", tables.size === 9, `got ${tables.size}`);

  const questions = new Set(results.map((r) => r.body.question));
  check("all nine questions are different", questions.size === 9, `got ${questions.size}`);
  const missions = new Set(results.map((r) => r.body.mission));
  check("all nine missions are different", missions.size === 9, `got ${missions.size}`);

  console.log("\n10. Admin dashboard");
  const summary = await json("/api/admin/summary", { headers: { Cookie: cookie } });
  check("summary loads for admin", summary.status === 200);
  check("participation is 36/36", summary.body?.submittedCount === 36 && summary.body?.totalCount === 36);
  check(
    "menu counts add up to 36",
    summary.body?.menuCounts?.reduce((a, m) => a + m.count, 0) === 36,
  );
  check(
    "speed counts add up to 36",
    summary.body?.speedCounts?.reduce((a, s) => a + s.count, 0) === 36,
  );
  check("status is ASSIGNED", summary.body?.status === "ASSIGNED", `got ${summary.body?.status}`);

  console.log("\n11. Regenerate produces a valid re-assignment");
  const regen = await json("/api/admin/assign", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ regenerate: true }),
  });
  check("regeneration succeeds", regen.status === 200, `status ${regen.status}`);
  const afterRegen = await json("/api/admin/summary", { headers: { Cookie: cookie } });
  check("still nine tables after regeneration", afterRegen.body?.groups?.length === 9);
  check(
    "all 36 people still seated exactly once",
    (() => {
      const seated = afterRegen.body.groups.flatMap((g) => g.members);
      return seated.length === 36 && new Set(seated).size === 36;
    })(),
  );

  console.log("\n12. Pages render");
  for (const path of ["/", "/name", "/menu", "/speed", "/waiting", "/result", "/admin"]) {
    const response = await fetch(`${BASE}${path}`);
    check(`GET ${path}`, response.status === 200, `status ${response.status}`);
  }

  console.log(
    failures === 0
      ? "\n✅ All end-to-end checks passed.\n"
      : `\n❌ ${failures} check(s) failed.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("smoke test crashed:", error);
  process.exit(1);
});
