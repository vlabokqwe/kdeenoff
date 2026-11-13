-- 0006_raffle_tokens.sql: Raffle entries and the tokens they grant.
-- One Kick account can enter a raffle once. Each entry grants one token.
-- Tokens are never spent; they stop counting once expires_at has passed.

CREATE TABLE IF NOT EXISTS raffle_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raffle_id INTEGER NOT NULL,
  kick_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (raffle_id, kick_user_id)
);

CREATE INDEX IF NOT EXISTS idx_raffle_entries_user ON raffle_entries(kick_user_id);

CREATE TABLE IF NOT EXISTS tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kick_user_id TEXT NOT NULL,
  -- entry_id is UNIQUE so one entry can never grant two tokens, even under a race.
  entry_id INTEGER NOT NULL UNIQUE,
  raffle_id INTEGER NOT NULL,
  raffle_title TEXT NOT NULL DEFAULT '',
  granted_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tokens_user_expires ON tokens(kick_user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_tokens_expires ON tokens(expires_at);

