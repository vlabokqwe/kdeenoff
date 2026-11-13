/**
 * Rebuilds both frontend bundles on change (used by `npm run serve`).
 * The NestJS backend serves dist/public and dist/admin, so the local preview
 * runs the same code path as production.
 *
 * Rollup's `vite build --watch` only rebuilds on module-graph changes and does
 * not watch `public/` (`public/css/main.css`, `public/img/**`, etc.), so we
 * also sync `public/` changes directly into `dist/public/`.
 */
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, statSync, watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = path.dirname(fileURLToPath(import.meta.url));
const publicSrcDir = path.join(frontendDir, "public");
const publicOutDir = path.join(frontendDir, "dist", "public");

const children = [
  spawn("npx vite build --watch --mode development", { stdio: "inherit", shell: true }),
  spawn("npx vite build --watch --mode development -c vite.admin.config.ts", {
    stdio: "inherit",
    shell: true,
  }),
];

const pendingCopies = new Map();
let publicWatcher = null;

function syncPublicFile(relFilename) {
  const normalized = String(relFilename || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) return;
  const srcPath = path.resolve(publicSrcDir, normalized);
  const relCheck = path.relative(publicSrcDir, srcPath);
  if (!relCheck || relCheck.startsWith("..") || path.isAbsolute(relCheck)) return;

  try {
    if (!existsSync(srcPath) || !statSync(srcPath).isFile()) return;
    const destPath = path.join(publicOutDir, relCheck);
    mkdirSync(path.dirname(destPath), { recursive: true });
    copyFileSync(srcPath, destPath);
  } catch {
    // Ignore transient editor swap/lock errors during watch builds.
  }
}

if (existsSync(publicSrcDir)) {
  try {
    publicWatcher = watch(publicSrcDir, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const key = String(filename);
      const prev = pendingCopies.get(key);
      if (prev) clearTimeout(prev);
      pendingCopies.set(
        key,
        setTimeout(() => {
          pendingCopies.delete(key);
          syncPublicFile(key);
        }, 80),
      );
    });
  } catch {
    // Fallback gracefully if recursive fs.watch is unavailable.
  }
}

function stop(code = 0) {
  if (publicWatcher) {
    try {
      publicWatcher.close();
    } catch {}
    publicWatcher = null;
  }
  for (const timer of pendingCopies.values()) clearTimeout(timer);
  pendingCopies.clear();
  for (const child of children) if (!child.killed) child.kill();
  setTimeout(() => process.exit(code), 200);
}

for (const child of children) child.on("exit", (code) => stop(code || 0));
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

