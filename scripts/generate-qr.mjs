/**
 * Generates the QR code handed out at the event.
 *
 * Usage: node scripts/generate-qr.mjs https://your-app.vercel.app
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";

const url = process.argv[2] ?? process.env.NEXT_PUBLIC_SITE_URL;

if (!url) {
  console.error(
    "URL이 필요합니다.\n  사용법: npm run qr -- https://your-app.vercel.app",
  );
  process.exit(1);
}

try {
  // Throws on a malformed URL before we write anything.
  new URL(url);
} catch {
  console.error(`올바른 URL이 아닙니다: ${url}`);
  process.exit(1);
}

const outDir = path.join(process.cwd(), "public", "qr");
await mkdir(outDir, { recursive: true });

const options = {
  errorCorrectionLevel: "H", // survives a printed poster being scuffed
  margin: 2,
  width: 1024,
  color: { dark: "#0f2f6b", light: "#ffffff" },
};

const pngPath = path.join(outDir, "lunch-mate.png");
const svgPath = path.join(outDir, "lunch-mate.svg");

await QRCode.toFile(pngPath, url, options);
await QRCode.toFile(svgPath, url, { ...options, type: "svg" });

console.log(`\n🍚 LUNCH MATE QR 생성 완료\n`);
console.log(`  URL : ${url}`);
console.log(`  PNG : ${pngPath}`);
console.log(`  SVG : ${svgPath}\n`);
console.log(await QRCode.toString(url, { type: "terminal", small: true }));
