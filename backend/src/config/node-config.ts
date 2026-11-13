import { isAbsolute, join, resolve } from "node:path";
import { AppConfig } from "./app-config";
import { REPO_ROOT, loadEnvFile } from "./paths";

function fromRoot(value: string | undefined, fallback: string): string {
  const v = String(value ?? "").trim() || fallback;
  return isAbsolute(v) ? v : resolve(REPO_ROOT, v);
}

/** Construct `AppConfig` for Node.js (NestJS + CLI scripts), loading `<repoRoot>/.env` first. */
export function createNodeAppConfig(): AppConfig {
  loadEnvFile();
  const env = process.env;
  return new AppConfig(env, {
    repoRoot: REPO_ROOT,
    databasePath: fromRoot(env.DATABASE_PATH, join("data", "kdeenoff.sqlite")),
    migrationsDir: join(REPO_ROOT, "migrations"),
    frontendDist: fromRoot(env.FRONTEND_DIST, join("frontend", "dist")),
  });
}

