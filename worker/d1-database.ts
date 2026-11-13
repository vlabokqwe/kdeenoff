import {
  type BindValue,
  type BoundStatement,
  DatabaseService,
  type Row,
  type RunResult,
} from "../backend/src/database/database.service";

export interface CfD1Meta {
  changes?: number;
  last_row_id?: number;
}

export interface CfD1Result<T = unknown> {
  results?: T[];
  success?: boolean;
  meta?: CfD1Meta;
}

export interface CfD1PreparedStatement {
  bind(...values: unknown[]): CfD1PreparedStatement;
  first<T = Row>(colName?: string): Promise<T | null>;
  all<T = Row>(): Promise<CfD1Result<T>>;
  run(): Promise<CfD1Result>;
}

export interface CfD1Database {
  prepare(query: string): CfD1PreparedStatement;
  batch<T = unknown>(statements: CfD1PreparedStatement[]): Promise<CfD1Result<T>[]>;
}

function normalizeD1Param(v: BindValue): string | number | ArrayBuffer | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "bigint") return Number(v);
  if (v instanceof Uint8Array) {
    return v.byteOffset === 0 && v.byteLength === v.buffer.byteLength
      ? (v.buffer as ArrayBuffer)
      : v.slice().buffer;
  }
  return v;
}

export class D1DatabaseService extends DatabaseService {
  constructor(private readonly d1: CfD1Database) {
    super();
  }

  private prepare(sql: string, params: BindValue[]): CfD1PreparedStatement {
    const stmt = this.d1.prepare(sql);
    if (params.length === 0) return stmt;
    return stmt.bind(...params.map(normalizeD1Param));
  }

  async first<T = Row>(sql: string, ...params: BindValue[]): Promise<T | null> {
    const row = await this.prepare(sql, params).first<T>();
    return row ?? null;
  }

  async all<T = Row>(sql: string, ...params: BindValue[]): Promise<T[]> {
    const res = await this.prepare(sql, params).all<T>();
    return Array.isArray(res.results) ? res.results : [];
  }

  async run(sql: string, ...params: BindValue[]): Promise<RunResult> {
    const res = await this.prepare(sql, params).run();
    return {
      changes: Number(res.meta?.changes ?? 0),
      lastRowId: Number(res.meta?.last_row_id ?? 0),
    };
  }

  async batch(statements: BoundStatement[]): Promise<RunResult[]> {
    if (statements.length === 0) return [];
    const prepared = statements.map((s) => this.prepare(s.sql, s.params));
    const results = await this.d1.batch(prepared);
    return results.map((res) => ({
      changes: Number(res.meta?.changes ?? 0),
      lastRowId: Number(res.meta?.last_row_id ?? 0),
    }));
  }
}

