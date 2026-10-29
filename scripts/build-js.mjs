/**
 * Post-build step: minify all public JS files in dist/ using esbuild.
 * Renames local identifiers, strips whitespace and comments.
 * Run after `eleventy` so the files already exist in dist/.
 */
import { transform } from "esbuild";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(root, "dist");

const files = [
  "js/main.js",
  "js/leaderboard.js",
  "js/wager-growth-schedule.js",
  "admin/admin.js",
];

for (const file of files) {
  const path = resolve(distDir, file);
  if (!existsSync(path)) continue;
  const source = readFileSync(path, "utf8");
  const result = await transform(source, {
    loader: "js",
    minify: true,
    format: "esm",
    target: "es2020",
  });
  writeFileSync(path, result.code);
  const saved = Math.round((1 - result.code.length / source.length) * 100);
  console.log(`  minified ${file}  (${source.length} → ${result.code.length} bytes, ${saved}% smaller)`);
}
