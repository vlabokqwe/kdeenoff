import { Injectable, Logger, OnApplicationShutdown } from "@nestjs/common";
import type Database from "better-sqlite3";
import { AppConfig } from "../config/app-config";
import { applyMigrations } from "./migrator";
import { openDatabase } from "./open";

/** Untyped result row, like D1 returns. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export type BindValue = string | number | bigint | Buffer | null | boolean | undefined;

export interface RunResult {
  /** D1 `meta.changes` */
  changes: number;
  /** D1 `meta.last_row_id` */
  lastRowId: number;
}

/** A prepared-but-not-run statement, for `batch()` (D1 `db.batch`). */
export interface BoundStatement {
  sql: string;
  params: BindValue[];
}

/** better-sqlite3 rejects booleans and undefined; D1 accepted them. */
function bindable(params: BindValue[]): (string | number | bigint | Buffer | null)[] {
  return params.map((v) => {
    if (v === undefined) return null;
    if (typeof v === "boolean") return v ? 1 : 0;
    return v;
  });
}

/**
 * Thin D1-shaped wrapper over better-sqlite3:
 *   D1 `.first()`              -> first()
 *   D1 `.all().results`        -> all()
 *   D1 `.run().meta`           -> run()  ({ changes, lastRowId })
 *   D1 `db.batch([...])`       -> batch() (one transaction, all or nothing)
 * Migrations from `<repo>/migrations` are applied when the service is created.
 */
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly logger = new Logger("Database");
  readonly db: Database.Database;
  private readonly cache = new Map<string, Database.Statement>();

  constructor(config: AppConfig) {
    this.db = openDatabase(config.databasePath);
    this.logger.log(`SQLite ${config.databasePath}`);
    const applied = applyMigrations(this.db, config.migrationsDir, (msg) => this.logger.log(msg));
    if (!applied.length) this.logger.log("migrations up to date");
  }

  private prepare(sql: string): Database.Statement {
    let stmt = this.cache.get(sql);
    if (!stmt) {
      stmt = this.db.prepare(sql);
      if (this.cache.size > 500) this.cache.clear();
      this.cache.set(sql, stmt);
    }
    return stmt;
  }

  first<T = Row>(sql: string, ...params: BindValue[]): T | null {
    const row = this.prepare(sql).get(...bindable(params));
    return (row as T | undefined) ?? null;
  }

  all<T = Row>(sql: string, ...params: BindValue[]): T[] {
    return this.prepare(sql).all(...bindable(params)) as T[];
  }

  run(sql: string, ...params: BindValue[]): RunResult {
    const info = this.prepare(sql).run(...bindable(params));
    return { changes: Number(info.changes) || 0, lastRowId: Number(info.lastInsertRowid) };
  }

  stmt(sql: string, ...params: BindValue[]): BoundStatement {
    return { sql, params };
  }

  /** All statements in one transaction (like D1 batch). Returns one RunResult per statement. */
  batch(statements: BoundStatement[]): RunResult[] {
    const exec = this.db.transaction((list: BoundStatement[]) =>
      list.map((s) => this.run(s.sql, ...s.params)),
    );
    return exec(statements);
  }

  onApplicationShutdown(): void {
    if (this.db.open) {
      this.db.close();
      this.logger.log("database closed");
    }
  }
}
