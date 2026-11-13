import { Injectable, Logger, OnApplicationShutdown } from "@nestjs/common";
import type Database from "better-sqlite3";
import { AppConfig } from "../config/app-config";
import {
  type BindValue,
  type BoundStatement,
  DatabaseService,
  type Row,
  type RunResult,
} from "./database.service";
import { applyMigrations } from "./migrator";
import { openDatabase } from "./open";

/** better-sqlite3 rejects booleans and undefined; D1 accepts booleans/null. */
function bindable(params: BindValue[]): (string | number | bigint | Uint8Array | null)[] {
  return params.map((v) => {
    if (v === undefined) return null;
    if (typeof v === "boolean") return v ? 1 : 0;
    return v;
  });
}

@Injectable()
export class SqliteDatabaseService extends DatabaseService implements OnApplicationShutdown {
  private readonly logger = new Logger("Database");
  readonly db: Database.Database;
  private readonly cache = new Map<string, Database.Statement>();

  constructor(config: AppConfig) {
    super();
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

  private runSync(sql: string, ...params: BindValue[]): RunResult {
    const info = this.prepare(sql).run(...bindable(params));
    return { changes: Number(info.changes) || 0, lastRowId: Number(info.lastInsertRowid) };
  }

  async first<T = Row>(sql: string, ...params: BindValue[]): Promise<T | null> {
    const row = this.prepare(sql).get(...bindable(params));
    return (row as T | undefined) ?? null;
  }

  async all<T = Row>(sql: string, ...params: BindValue[]): Promise<T[]> {
    return this.prepare(sql).all(...bindable(params)) as T[];
  }

  async run(sql: string, ...params: BindValue[]): Promise<RunResult> {
    return this.runSync(sql, ...params);
  }

  async batch(statements: BoundStatement[]): Promise<RunResult[]> {
    if (!statements.length) return [];
    const exec = this.db.transaction((list: BoundStatement[]) =>
      list.map((s) => this.runSync(s.sql, ...s.params)),
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

