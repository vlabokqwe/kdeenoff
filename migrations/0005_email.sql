-- 0005_email.sql: A browser session can hold a confirmed email and a linked Kick account.

CREATE TABLE IF NOT EXISTS site_people (
  id TEXT PRIMARY KEY,
  email TEXT,
  email_verified_at INTEGER,
  kick_user_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_site_people_email ON site_people(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_people_kick ON site_people(kick_user_id);

CREATE TABLE IF NOT EXISTS site_sessions (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_site_sessions_person ON site_sessions(person_id);
CREATE INDEX IF NOT EXISTS idx_site_sessions_expires ON site_sessions(expires_at);

CREATE TABLE IF NOT EXISTS email_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id TEXT NOT NULL,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_codes_email_created ON email_codes(email, created_at);
