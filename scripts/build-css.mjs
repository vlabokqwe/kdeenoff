/**
 * Post-build step: minify CSS in dist/ (removes whitespace, comments).
 * Run after `eleventy` so passthrough files already exist in dist/.
 */
import { transform } from "esbuild";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(root, "dist");

const files = ["css/main.css", "css/admin.css"];

for (const file of files) {
  const path = resolve(distDir, file);
  if (!existsSync(path)) continue;
  const source = readFileSync(path, "utf8");
  const result = await transform(source, {
    loader: "css",
    minify: true,
  });
  writeFileSync(path, result.code);
  const saved = Math.round((1 - result.code.length / source.length) * 100);
  console.log(`  minified ${file}  (${source.length} → ${result.code.length} bytes, ${saved}% smaller)`);
}
