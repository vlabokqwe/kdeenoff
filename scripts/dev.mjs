/**
 * Local preview that matches production:
 * Vite rebuilds frontend/dist (public + admin) on change, and the NestJS backend
 * serves it on http://localhost:8080/ together with /api and the local SQLite database
 * (migrations are applied on backend start).
 *
 *   npm run serve           -> http://localhost:8080/  (acceptance)
 *   npm run serve -- --hmr  -> also starts the Vite dev server with HMR on :5173 (proxy /api -> :8080)
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const withHmr = process.argv.includes("--hmr");
const env = { ...process.env, FORCE_COLOR: "1" };

function start(command) {
  return spawn(command, { cwd: root, stdio: "inherit", shell: true, env });
}

const children = [
  start("npm run build:watch -w frontend"),
  start("npm run start:dev -w backend"),
];
if (withHmr) children.push(start("npm run dev -w frontend"));

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill();
  setTimeout(() => process.exit(code), 300);
}

for (const child of children) {
  child.on("exit", (code) => {
    if (!stopping) {
      console.error(`a dev process exited (${code ?? "signal"}), stopping preview`);
      stop(code || 1);
    }
  });
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
