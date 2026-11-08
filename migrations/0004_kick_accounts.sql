-- 0004_kick_accounts.sql: Kick account links and the browser sessions that hold them.

CREATE TABLE IF NOT EXISTS kick_accounts (
  kick_user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar_url TEXT NOT NULL DEFAULT '',
  linked_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kick_sessions (
  id TEXT PRIMARY KEY,
  kick_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kick_sessions_user ON kick_sessions(kick_user_id);
CREATE INDEX IF NOT EXISTS idx_kick_sessions_expires ON kick_sessions(expires_at);
