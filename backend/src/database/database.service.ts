import { Injectable } from "@nestjs/common";

/** Untyped result row, like D1 returns. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export type BindValue = string | number | bigint | Uint8Array | null | boolean | undefined;

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

/**
 * Runtime-agnostic SQL database interface implemented by:
 *   - `SqliteDatabaseService` (local / Node via `better-sqlite3`)
 *   - `D1DatabaseService`     (Cloudflare Worker via `env.DB`)
 */
@Injectable()
export abstract class DatabaseService {
  abstract first<T = Row>(sql: string, ...params: BindValue[]): Promise<T | null>;
  abstract all<T = Row>(sql: string, ...params: BindValue[]): Promise<T[]>;
  abstract run(sql: string, ...params: BindValue[]): Promise<RunResult>;

  stmt(sql: string, ...params: BindValue[]): BoundStatement {
    return { sql, params };
  }

  /** All statements in one atomic transaction (D1 `db.batch` / SQLite `transaction`). */
  abstract batch(statements: BoundStatement[]): Promise<RunResult[]>;
}
