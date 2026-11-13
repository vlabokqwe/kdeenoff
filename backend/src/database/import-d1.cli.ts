/**
 * Import a Cloudflare D1 SQL export into an EMPTY SQLite file, then apply any newer migrations.
 *
 *   npx wrangler d1 export kdeenoff_db --remote --output dump.sql
 *   npm run db:import -w backend -- dump.sql                 (target: DATABASE_PATH)
 *   npm run db:import -w backend -- dump.sql --db other.sqlite
 *
 * Relative paths resolve from the folder npm was started in (INIT_CWD).
 * Refuses to touch a database that already has tables. The dump carries the d1_migrations
 * rows, so migrations already applied on D1 are not run again.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { AppConfig } from "../config/app-config";
import { applyMigrations } from "./migrator";
import { openDatabase } from "./open";

function usage(): never {
  console.error("usage: npm run db:import -w backend -- <d1-export.sql> [--db <target.sqlite>]");
  process.exit(2);
}

function fromInvocationDir(p: string): string {
  if (isAbsolute(p)) return p;
  return resolve(process.env.INIT_CWD || process.cwd(), p);
}

function main(): void {
  const args = process.argv.slice(2);
  let dumpArg = "";
  let dbArg = "";
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--db") dbArg = args[++i] || usage();
    else if (a.startsWith("--db=")) dbArg = a.slice(5);
    else if (a === "-h" || a === "--help") usage();
    else if (!dumpArg) dumpArg = a;
    else usage();
  }
  if (!dumpArg) usage();

  const config = new AppConfig();
  const dumpPath = fromInvocationDir(dumpArg);
  const target = dbArg ? fromInvocationDir(dbArg) : config.databasePath;
  if (!existsSync(dumpPath) || !statSync(dumpPath).isFile()) {
    throw new Error(`dump not found: ${dumpPath}`);
  }

  const sql = readFileSync(dumpPath, "utf8")
    .replace(/^\uFEFF/, "")
    // We wrap the whole load in one transaction ourselves.
    .replace(/^[ \t]*(BEGIN(?:[ \t]+(?:DEFERRED|IMMEDIATE|EXCLUSIVE))?(?:[ \t]+TRANSACTION)?|COMMIT(?:[ \t]+TRANSACTION)?|END(?:[ \t]+TRANSACTION)?)[ \t]*;[ \t]*\r?$/gim, "");
  if (!sql.trim()) throw new Error("dump is empty");

  const db = openDatabase(target);
  try {
    const tables = db
      .prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
      .get() as { n: number };
    if (Number(tables.n) > 0) {
      throw new Error(
        `refusing to import: ${target} already has ${tables.n} table(s). Point DATABASE_PATH (or --db) at a new file.`,
      );
    }

    console.log(`importing ${dumpPath}`);
    console.log(`into      ${target}`);

    // Rows arrive in table order, not dependency order: check foreign keys after the load.
    db.pragma("foreign_keys = OFF");
    const load = db.transaction(() => {
      db.exec(sql);
    });
    load();
    db.pragma("foreign_keys = ON");

    const fkProblems = db.pragma("foreign_key_check") as unknown[];
    if (fkProblems.length) {
      console.warn(`warning: ${fkProblems.length} row(s) fail foreign key checks (kept as in D1)`);
    }
    const integrity = db.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") console.warn(`warning: integrity_check: ${String(integrity)}`);

    const hasMigrations = db
      .prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'd1_migrations'`)
      .get() as { n: number };
    if (!Number(hasMigrations.n)) {
      console.warn("warning: the dump has no d1_migrations table; all migrations will be applied on top of it");
    }

    const applied = applyMigrations(db, config.migrationsDir, (msg) => console.log(msg));
    const counts = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name`,
      )
      .all() as { name: string }[];
    for (const { name } of counts) {
      const row = db.prepare(`SELECT COUNT(*) AS n FROM "${name.replace(/"/g, '""')}"`).get() as { n: number };
      console.log(`  ${name}: ${row.n}`);
    }
    db.pragma("wal_checkpoint(TRUNCATE)");
    console.log(`done${applied.length ? `, ${applied.length} newer migration(s) applied` : ""}`);
  } finally {
    db.close();
  }
}

try {
  main();
} catch (err) {
  console.error((err as Error).message || err);
  process.exit(1);
}
