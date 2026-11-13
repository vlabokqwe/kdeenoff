import m0001 from "../migrations/0001_init.sql";
import m0002 from "../migrations/0002_seed.sql";
import m0003 from "../migrations/0003_raffles.sql";
import m0004 from "../migrations/0004_kick_accounts.sql";
import m0005 from "../migrations/0005_email.sql";
import m0006 from "../migrations/0006_raffle_tokens.sql";
import m0007 from "../migrations/0007_daily_cases.sql";
import m0008 from "../migrations/0008_ranks.sql";
import m0009 from "../migrations/0009_market.sql";
import m0010 from "../migrations/0010_remove_rewards.sql";
import m0011 from "../migrations/0011_olympus_avatars.sql";
import m0012 from "../migrations/0012_leaderboard_placements_and_demo.sql";
import m0013 from "../migrations/0013_raffle_end_mode.sql";
import m0014 from "../migrations/0014_kdeenoff_monkey_avatars.sql";
import m0015 from "../migrations/0015_streamer_role_and_raffle_draw_modes.sql";
import m0016 from "../migrations/0016_raffle_winners_history.sql";
import m0017 from "../migrations/0017_raffle_spin_duration_ms.sql";
import m0018 from "../migrations/0018_partner_username_and_raffle_bans.sql";
import type { CfD1Database } from "./d1-database";

const D1_MIGRATIONS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS d1_migrations(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
)`;

const MIGRATIONS: readonly { name: string; sql: string }[] = [
  { name: "0001_init.sql", sql: m0001 },
  { name: "0002_seed.sql", sql: m0002 },
  { name: "0003_raffles.sql", sql: m0003 },
  { name: "0004_kick_accounts.sql", sql: m0004 },
  { name: "0005_email.sql", sql: m0005 },
  { name: "0006_raffle_tokens.sql", sql: m0006 },
  { name: "0007_daily_cases.sql", sql: m0007 },
  { name: "0008_ranks.sql", sql: m0008 },
  { name: "0009_market.sql", sql: m0009 },
  { name: "0010_remove_rewards.sql", sql: m0010 },
  { name: "0011_olympus_avatars.sql", sql: m0011 },
  { name: "0012_leaderboard_placements_and_demo.sql", sql: m0012 },
  { name: "0013_raffle_end_mode.sql", sql: m0013 },
  { name: "0014_kdeenoff_monkey_avatars.sql", sql: m0014 },
  { name: "0015_streamer_role_and_raffle_draw_modes.sql", sql: m0015 },
  { name: "0016_raffle_winners_history.sql", sql: m0016 },
  { name: "0017_raffle_spin_duration_ms.sql", sql: m0017 },
  { name: "0018_partner_username_and_raffle_bans.sql", sql: m0018 },
];

/**
 * Splits a `.sql` migration file into individual SQL statements while preserving
 * single-quoted string literals (`'...'` with `''` escapes) and stripping `--` / `/* ... *\/` comments.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let buf = "";
  let inSingleQuote = false;
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];
    const next = i + 1 < sql.length ? sql[i + 1] : "";

    if (inSingleQuote) {
      if (ch === "'" && next === "'") {
        buf += "''";
        i += 2;
        continue;
      }
      if (ch === "'") {
        inSingleQuote = false;
      }
      buf += ch;
      i += 1;
      continue;
    }

    if (ch === "-" && next === "-") {
      i += 2;
      while (i < sql.length && sql[i] !== "\n") i += 1;
      continue;
    }

    if (ch === "/" && next === "*") {
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      buf += ch;
      i += 1;
      continue;
    }

    if (ch === ";") {
      const trimmed = buf.trim();
      if (trimmed) statements.push(trimmed);
      buf = "";
      i += 1;
      continue;
    }

    buf += ch;
    i += 1;
  }

  const tail = buf.trim();
  if (tail) statements.push(tail);
  return statements;
}

let migrationPromise: Promise<void> | null = null;

async function runPendingD1Migrations(d1: CfD1Database): Promise<void> {
  await d1.prepare(D1_MIGRATIONS_TABLE_SQL).run();
  const existing = await d1.prepare("SELECT name FROM d1_migrations").all<{ name: string }>();
  const applied = new Set((existing.results || []).map((r) => r.name));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue;
    const statements = splitSqlStatements(migration.sql);
    for (const stmtSql of statements) {
      try {
        await d1.prepare(stmtSql).run();
      } catch (err) {
        const msg = String((err as Error)?.message || err).toLowerCase();
        const upper = stmtSql.trimStart().toUpperCase();
        if (upper.startsWith("ALTER TABLE") && msg.includes("duplicate column name")) {
          continue;
        }
        if (upper.startsWith("ALTER TABLE") && msg.includes("no such column")) {
          continue;
        }
        throw new Error(`D1 migration ${migration.name} failed: ${(err as Error)?.message || err}`);
      }
    }
    await d1.prepare("INSERT OR IGNORE INTO d1_migrations (name) VALUES (?)").bind(migration.name).run();
    console.log(`[D1Migrator] applied migration ${migration.name}`);
  }
}

export function ensureD1Migrated(d1: CfD1Database): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = runPendingD1Migrations(d1).catch((err) => {
      migrationPromise = null;
      throw err;
    });
  }
  return migrationPromise;
}

