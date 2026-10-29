-- 0001_init.sql: Core schema for KDeenOff leaderboards, settings & audit

CREATE TABLE IF NOT EXISTS leaderboards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  prize_pool_cents INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  partner_signup_url TEXT,
  partner TEXT,
  avatar_style TEXT NOT NULL DEFAULT 'auto',
  auto_rank_by_wagered INTEGER NOT NULL DEFAULT 1,
  auto_wager_growth_enabled INTEGER NOT NULL DEFAULT 0,
  auto_wager_growth_pct INTEGER NOT NULL DEFAULT 3,
  auto_wager_growth_interval_ms INTEGER NOT NULL DEFAULT 43200000,
  auto_hidden_above_rank INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leaderboards_slug ON leaderboards(slug);
CREATE INDEX IF NOT EXISTS idx_leaderboards_visible ON leaderboards(hidden, archived);

CREATE TABLE IF NOT EXISTS lb_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL REFERENCES leaderboards(id) ON DELETE CASCADE,
  user_id INTEGER,
  rank INTEGER,
  sort_order INTEGER,
  username TEXT NOT NULL,
  wagered_cents INTEGER NOT NULL DEFAULT 0,
  prize_cents INTEGER NOT NULL DEFAULT 0,
  avatar_url TEXT,
  avatar_sid TEXT,
  wag_growth_enabled INTEGER NOT NULL DEFAULT 0,
  wag_growth_pct INTEGER,
  wag_growth_hours REAL,
  wag_growth_last_at INTEGER,
  wag_growth_schedule_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_lb_players_board ON lb_players(board_id);
CREATE INDEX IF NOT EXISTS idx_lb_players_rank ON lb_players(board_id, rank);
CREATE INDEX IF NOT EXISTS idx_lb_players_wagered ON lb_players(board_id, wagered_cents DESC);

CREATE TABLE IF NOT EXISTS lb_spot_prizes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL REFERENCES leaderboards(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  prize_cents INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  UNIQUE(board_id, rank)
);

CREATE INDEX IF NOT EXISTS idx_lb_spots_board ON lb_spot_prizes(board_id);

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER,
  actor_email TEXT,
  action TEXT NOT NULL,
  target TEXT,
  meta_json TEXT,
  at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at DESC);
