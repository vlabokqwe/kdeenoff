/**
 * Local preview that matches production:
 * Eleventy rebuilds dist/, Wrangler serves it through the same Worker
 * (board rewrites + /api + local D1).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env, CI: "1" };

function start(command) {
  return spawn(command, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env,
  });
}

function run(command) {
  return new Promise((resolve, reject) => {
    const child = start(command);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? "signal"}`));
    });
  });
}

await run("npx wrangler d1 migrations apply kdeenoff_db --local");

const eleventy = start("npx eleventy --watch");
let wrangler;
let wranglerStartedAt = 0;
let rapidFailures = 0;
let stopping = false;

function startWrangler() {
  wranglerStartedAt = Date.now();
  wrangler = start(
    "npx wrangler dev --port 8080 --local --live-reload --show-interactive-dev-session false",
  );
  wrangler.on("exit", (code) => {
    if (stopping) return;
    const lived = Date.now() - wranglerStartedAt;
    if (lived < 5000) {
      rapidFailures += 1;
      if (rapidFailures >= 5) {
        console.error("wrangler failed repeatedly, stopping preview");
        stop(code || 1);
        return;
      }
    } else {
      rapidFailures = 0;
    }
    console.error(`wrangler exited (${code ?? "signal"}), restarting preview...`);
    setTimeout(() => {
      if (!stopping) startWrangler();
    }, 500);
  });
}

startWrangler();

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of [eleventy, wrangler]) {
    if (child && !child.killed) child.kill();
  }
  setTimeout(() => process.exit(code), 300);
}

eleventy.on("exit", (code) => {
  if (!stopping) stop(code || 0);
});

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
