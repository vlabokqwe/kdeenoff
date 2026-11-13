-- 0007_daily_cases.sql: Daily cases paid out in coins.
-- A case unlocks while the Kick account holds at least required_tokens live raffle tokens.
-- Tokens are never spent. Each case can be opened once per 24 hours per Kick account.
-- prizes is a JSON array of { "coins": int >= 0, "weight": int > 0 }. coins = 0 means "nothing".

CREATE TABLE IF NOT EXISTS cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  note TEXT,
  required_tokens INTEGER NOT NULL,
  prizes TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Every opening, kept for good. The coin balance is the sum of coins here.
CREATE TABLE IF NOT EXISTS case_opens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL,
  kick_user_id TEXT NOT NULL,
  case_title TEXT NOT NULL DEFAULT '',
  coins INTEGER NOT NULL DEFAULT 0,
  opened_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_case_opens_user_case ON case_opens(kick_user_id, case_id, opened_at);
CREATE INDEX IF NOT EXISTS idx_case_opens_user ON case_opens(kick_user_id);

-- Starter set. Admins can edit or replace these.
INSERT INTO cases (title, note, required_tokens, prizes, sort_order, hidden, created_at, updated_at)
SELECT 'Basic case', NULL, 3,
  '[{"coins":0,"weight":45},{"coins":5,"weight":30},{"coins":10,"weight":18},{"coins":25,"weight":7}]',
  1, 0, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM cases);

INSERT INTO cases (title, note, required_tokens, prizes, sort_order, hidden, created_at, updated_at)
SELECT 'Silver case', NULL, 16,
  '[{"coins":0,"weight":35},{"coins":25,"weight":35},{"coins":50,"weight":20},{"coins":100,"weight":10}]',
  2, 0, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE (SELECT COUNT(*) FROM cases) = 1;

INSERT INTO cases (title, note, required_tokens, prizes, sort_order, hidden, created_at, updated_at)
SELECT 'Gold case', NULL, 28,
  '[{"coins":0,"weight":25},{"coins":75,"weight":35},{"coins":150,"weight":25},{"coins":300,"weight":15}]',
  3, 0, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE (SELECT COUNT(*) FROM cases) = 2;

