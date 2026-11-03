-- 0003_raffles.sql: Raffles the admin can add. Public page splits them by ends_at.

CREATE TABLE IF NOT EXISTS raffles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  prize TEXT NOT NULL DEFAULT '',
  note TEXT,
  winner TEXT,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_raffles_visible_ends ON raffles(hidden, ends_at);
