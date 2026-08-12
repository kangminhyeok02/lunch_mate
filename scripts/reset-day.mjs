/**
 * Clears one day's submissions and groups in Supabase.
 * Useful for rehearsing the event, and before a smoke test run.
 *
 * Usage: node scripts/reset-day.mjs [YYYY-MM-DD]
 */

import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

async function loadEnv() {
  try {
    const raw = await readFile(".env", "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {
    // Variables may already be exported.
  }
}

await loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("❌ Supabase 환경변수가 없습니다.");
  process.exit(1);
}

const date =
  process.argv[2] ??
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const client = createClient(url, key, { auth: { persistSession: false } });

// Members cascade from groups, so deleting groups is enough.
await client.from("lunch_groups").delete().eq("date", date);
await client.from("lunch_preferences").delete().eq("date", date);
await client.from("lunch_days").upsert({ date, status: "NOT_STARTED" }, { onConflict: "date" });

console.log(`✅ ${date} 데이터를 초기화했습니다.`);
