/**
 * Supabase Realtime이 실제로 이벤트를 보내는지 확인한다.
 *
 * 참가자 화면이 새로고침 없이 결과로 넘어가려면 이 구독이 살아 있어야 한다.
 * 구독을 걸어둔 상태에서 배정을 실행하고, 이벤트가 도착하는지 본다.
 *
 *   node scripts/check-realtime.mjs --url=http://localhost:3001
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

const raw = await readFile(".env", "utf8");
for (const line of raw.split(/\r?\n/)) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

// 참가자 브라우저와 동일한 조건: anon 키만 사용.
const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);

const events = [];

console.log("\n📡 Realtime 구독 확인\n");

const channel = client
  .channel("lunch-mate-status")
  .on("postgres_changes", { event: "*", schema: "public", table: "lunch_days" }, (payload) => {
    events.push(`lunch_days ${payload.eventType}`);
  })
  .on("postgres_changes", { event: "*", schema: "public", table: "lunch_groups" }, (payload) => {
    events.push(`lunch_groups ${payload.eventType}`);
  })
  .on("postgres_changes", { event: "*", schema: "public", table: "lunch_preferences" }, (payload) => {
    events.push(`lunch_preferences ${payload.eventType}`);
  });

const subscribed = await new Promise((resolve) => {
  const timer = setTimeout(() => resolve("TIMEOUT"), 15000);
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      clearTimeout(timer);
      resolve(status);
    }
  });
});

console.log(`구독 상태 : ${subscribed}`);

if (subscribed !== "SUBSCRIBED") {
  console.error(
    "\n❌ Realtime 구독에 실패했습니다.\n" +
      "   migration.sql 마지막의 `alter publication supabase_realtime add table ...` 를 확인하세요.\n" +
      "   (구독이 실패해도 앱은 폴링으로 동작합니다.)\n",
  );
  process.exit(1);
}

console.log("구독 성공. 이제 배정을 실행합니다...\n");

spawnSync(
  process.execPath,
  ["scripts/simulate.mjs", `--url=${BASE}`, "--reset", "--assign", "--seed=realtime-check"],
  { stdio: ["inherit", "ignore", "inherit"] },
);

// 이벤트가 도착할 시간을 준다.
await new Promise((resolve) => setTimeout(resolve, 4000));

console.log(`${"=".repeat(52)}`);
console.log(`수신한 이벤트 : ${events.length}건`);
for (const [name, count] of Object.entries(
  events.reduce((acc, e) => ({ ...acc, [e]: (acc[e] ?? 0) + 1 }), {}),
)) {
  console.log(`  ${name} × ${count}`);
}
console.log("=".repeat(52));

const sawGroups = events.some((e) => e.startsWith("lunch_groups"));
const sawDays = events.some((e) => e.startsWith("lunch_days"));

if (sawGroups || sawDays) {
  console.log("\n✅ 배정 시 참가자 화면이 자동으로 갱신됩니다.\n");
} else {
  console.log(
    "\n⚠️  구독은 됐지만 이벤트가 오지 않았습니다. 폴링 백업으로는 동작합니다.\n",
  );
}

await client.removeChannel(channel);
process.exit(0);
