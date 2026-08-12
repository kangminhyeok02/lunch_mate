/**
 * food/ 에 넣어둔 메뉴판 사진을 앱에 반영한다.
 *
 *   food/1.*  →  MENU A
 *   food/2.*  →  MENU B
 *
 * 확장자(jpg/jpeg/png/webp)는 원본을 따라가고, 기본 메뉴의 imageUrl 도 함께 맞춘다.
 *
 *   npm run menu:sync
 */

import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const SUPPORTED = [".jpg", ".jpeg", ".png", ".webp"];
const SOURCE_DIR = "food";
const TARGET_DIR = path.join("public", "menu");
const TYPES_FILE = path.join("src", "lib", "store", "types.ts");

const SLOTS = [
  { source: "1", target: "menu-a", label: "MENU A" },
  { source: "2", target: "menu-b", label: "MENU B" },
];

console.log("\n🍱 메뉴 사진 동기화\n");

let entries;
try {
  entries = await readdir(SOURCE_DIR);
} catch {
  console.error(`❌ ${SOURCE_DIR}/ 폴더가 없습니다.`);
  process.exit(1);
}

await mkdir(TARGET_DIR, { recursive: true });

let typesSource = await readFile(TYPES_FILE, "utf8");
let changed = 0;

for (const slot of SLOTS) {
  const match = entries.find((name) => {
    const ext = path.extname(name).toLowerCase();
    return path.basename(name, ext) === slot.source && SUPPORTED.includes(ext);
  });

  if (!match) {
    console.log(`  [건너뜀] ${slot.label} — ${SOURCE_DIR}/${slot.source}.{jpg,png,webp} 없음`);
    continue;
  }

  const ext = path.extname(match).toLowerCase();
  const targetName = `${slot.target}${ext === ".jpeg" ? ".jpg" : ext}`;
  const targetPath = path.join(TARGET_DIR, targetName);

  await copyFile(path.join(SOURCE_DIR, match), targetPath);
  const { size } = await stat(targetPath);

  // 확장자가 바뀌었을 수 있으므로 기본 메뉴의 경로도 맞춰 준다.
  const urlPattern = new RegExp(`"/menu/${slot.target}\\.[a-z]+"`);
  const nextUrl = `"/menu/${targetName}"`;
  if (urlPattern.test(typesSource)) {
    if (!typesSource.includes(nextUrl)) changed += 1;
    typesSource = typesSource.replace(urlPattern, nextUrl);
  }

  console.log(
    `  [반영] ${slot.label} ← ${SOURCE_DIR}/${match}  (${(size / 1024).toFixed(0)}KB → /menu/${targetName})`,
  );
}

if (changed > 0) {
  await writeFile(TYPES_FILE, typesSource, "utf8");
  console.log(`\n  ${TYPES_FILE} 의 imageUrl 을 갱신했습니다.`);
}

console.log("\n다음: npm run build 로 확인한 뒤 커밋/푸시하면 배포됩니다.\n");
