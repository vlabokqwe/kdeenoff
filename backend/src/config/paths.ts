import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Repo root = the first parent folder that holds both `package.json` and `migrations/`.
 * Works from `backend/src` (ts-node / nest start) and from `backend/dist` (node dist/main.js),
 * whatever the current working directory is (npm -w runs scripts inside backend/).
 */
export function findRepoRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, "migrations")) && existsSync(join(dir, "package.json"))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  // backend/dist/config -> repo root
  return resolve(__dirname, "..", "..", "..");
}

export const REPO_ROOT = findRepoRoot();

/** Load `<repoRoot>/.env` once. Missing file is fine; existing env vars win. */
let envLoaded = false;
export function loadEnvFile(): void {
  if (envLoaded) return;
  envLoaded = true;
  try {
    process.loadEnvFile(join(REPO_ROOT, ".env"));
  } catch {
    // no .env (or unreadable): rely on the real environment
  }
}
