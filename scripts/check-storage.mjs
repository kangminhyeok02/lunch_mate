/**
 * 메뉴 사진 보관함이 준비됐는지 확인한다.
 * 실제로 작은 파일을 올렸다가 지워보므로, 통과하면 진짜로 동작하는 것이다.
 *
 *   node scripts/check-storage.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

const raw = await readFile(".env", "utf8");
for (const line of raw.split(/\r?\n/)) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("❌ Supabase 환경변수가 없습니다.");
  process.exit(1);
}

const BUCKET = "menu-images";
const client = createClient(url, key, { auth: { persistSession: false } });

console.log(`\n📦 메뉴 사진 보관함 확인 → ${url}\n`);

// 1x1 투명 PNG
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const path = `__check-${Date.now()}.png`;

const { error: uploadError } = await client.storage
  .from(BUCKET)
  .upload(path, PIXEL, { contentType: "image/png", upsert: true });

if (uploadError) {
  console.log(`  [실패] 업로드 — ${uploadError.message}\n`);
  console.error(
    "❌ 보관함이 준비되지 않았습니다.\n" +
      "   Supabase Studio → SQL Editor 에서 supabase/storage.sql 을 실행하세요.\n",
  );
  process.exit(1);
}
console.log("  [OK] 업로드");

const { data: publicUrl } = client.storage.from(BUCKET).getPublicUrl(path);
const response = await fetch(publicUrl.publicUrl);
console.log(
  `  [${response.ok ? "OK" : "실패"}] 공개 URL 접근 (${response.status})`,
);

await client.storage.from(BUCKET).remove([path]);
console.log("  [OK] 정리");

if (!response.ok) {
  console.error(
    "\n❌ 업로드는 됐지만 사진이 공개되지 않습니다.\n" +
      "   버킷이 public 인지 확인하세요 (storage.sql 이 처리합니다).\n",
  );
  process.exit(1);
}

console.log("\n✅ 메뉴 사진 업로드 준비 완료.\n");
