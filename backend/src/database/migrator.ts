import type Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Same bookkeeping table wrangler uses for D1, so a `wrangler d1 export` dump
 * (which contains d1_migrations rows) is recognised and not re-applied.
 */
export const D1_MIGRATIONS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS d1_migrations(
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
)`;

export function listMigrationFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Apply every `migrations/*.sql` not yet listed in d1_migrations, in name order.
 * Each file runs in its own transaction together with its d1_migrations row (all or nothing).
 * @returns names applied by this call
 */
export function applyMigrations(
  db: Database.Database,
  dir: string,
  log: (msg: string) => void = () => {},
): string[] {
  db.exec(D1_MIGRATIONS_TABLE_SQL);
  const applied = new Set(
    (db.prepare(`SELECT name FROM d1_migrations`).all() as { name: string }[]).map((row) => row.name),
  );
  const done: string[] = [];
  for (const name of listMigrationFiles(dir)) {
    if (applied.has(name)) continue;
    const sql = readFileSync(join(dir, name), "utf8");
    const apply = db.transaction(() => {
      db.exec(sql);
      db.prepare(`INSERT INTO d1_migrations (name) VALUES (?)`).run(name);
    });
    try {
      apply();
    } catch (err) {
      throw new Error(`Migration ${name} failed: ${(err as Error).message}`);
    }
    log(`applied migration ${name}`);
    done.push(name);
  }
  return done;
}
