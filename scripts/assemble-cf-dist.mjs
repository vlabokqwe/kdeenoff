import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicSrc = resolve(rootDir, "frontend", "dist", "public");
const adminSrc = resolve(rootDir, "frontend", "dist", "admin");
const outDir = resolve(rootDir, "dist");
const outAdminDir = resolve(outDir, "admin");

if (!existsSync(resolve(publicSrc, "index.html"))) {
  console.error("Missing frontend/dist/public/index.html. Run `npm run build -w frontend` first.");
  process.exit(1);
}
if (!existsSync(resolve(adminSrc, "index.html"))) {
  console.error("Missing frontend/dist/admin/index.html. Run `npm run build -w frontend` first.");
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(publicSrc, outDir, { recursive: true });
mkdirSync(outAdminDir, { recursive: true });
cpSync(adminSrc, outAdminDir, { recursive: true });

console.log("[cf-dist] Assembled Cloudflare static assets into dist/");

