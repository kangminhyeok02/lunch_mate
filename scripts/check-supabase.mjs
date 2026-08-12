/**
 * Verifies the Supabase project is reachable and the schema has been applied.
 *
 * Usage: node scripts/check-supabase.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

// Minimal .env reader so this runs outside Next.js.
async function loadEnv() {
  try {
    const raw = await readFile(".env", "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {
    // No .env is fine if the variables are already exported.
  }
}

await loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 필요합니다.");
  process.exit(1);
}

console.log(`\nSupabase 연결 확인 → ${url}\n`);

const client = createClient(url, key, { auth: { persistSession: false } });

const TABLES = [
  "users",
  "menu_options",
  "lunch_preferences",
  "questions",
  "missions",
  "lunch_groups",
  "lunch_group_members",
  "lunch_days",
];

let missing = 0;

for (const table of TABLES) {
  // A real GET: a HEAD/count request does not surface a missing-table error.
  const { error } = await client.from(table).select("*").limit(1);
  if (error) {
    missing += 1;
    console.log(`  [MISSING] ${table} — ${error.message}`);
  } else {
    console.log(`  [OK]      ${table}`);
  }
}

if (missing > 0) {
  console.log(
    `\n❌ ${missing}개 테이블이 없습니다.\n` +
      `   Supabase Studio → SQL Editor 에서 supabase/migration.sql 을 실행하세요.\n`,
  );
  process.exit(1);
}

console.log("\n✅ 스키마가 모두 준비되었습니다.\n");
