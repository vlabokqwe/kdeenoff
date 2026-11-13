import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/** Open the SQLite file with the same guarantees D1 gives (foreign keys on) plus WAL. */
export function openDatabase(file: string, opts: { readonly?: boolean } = {}): Database.Database {
  if (!opts.readonly) mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file, { readonly: Boolean(opts.readonly), fileMustExist: Boolean(opts.readonly) });
  db.pragma("busy_timeout = 5000");
  if (!opts.readonly) {
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
  }
  db.pragma("foreign_keys = ON");
  return db;
}
