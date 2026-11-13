-- 0008_ranks.sql: Account ranks from experience (XP), and cases tied to a rank.
-- XP belongs to the Kick account, like tokens. It comes from:
--   * a raffle entry (granted together with the token),
--   * a finished leaderboard, if the player's name matches a linked Kick account.
--     Players without a linked account get nothing; that XP is not kept anywhere.
-- A rank is reached at min_xp. Exactly one rank has min_xp = 0 (the starting rank).
-- Each case belongs to a rank. A viewer sees the cases of the highest rank they reached
-- that has visible cases, so a new rank swaps the set for better ones.

CREATE TABLE IF NOT EXISTS ranks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  min_xp INTEGER NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- One row per grant. UNIQUE keeps a raffle or a board from paying the same account twice.
CREATE TABLE IF NOT EXISTS xp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kick_user_id TEXT NOT NULL,
  source TEXT NOT NULL,          -- 'raffle' | 'board'
  source_id INTEGER NOT NULL,    -- raffle id or leaderboard id
  xp INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  UNIQUE (source, source_id, kick_user_id)
);

CREATE INDEX IF NOT EXISTS idx_xp_events_user ON xp_events(kick_user_id, created_at);

-- Set once a finished board has paid out XP (or was skipped).
ALTER TABLE leaderboards ADD COLUMN xp_awarded_at INTEGER;

ALTER TABLE cases ADD COLUMN rank_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_cases_rank ON cases(rank_id);

-- Starter ranks.
INSERT OR IGNORE INTO ranks (title, min_xp, created_at, updated_at) VALUES
  ('Rookie', 0, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('Regular', 100, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('Veteran', 400, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('Legend', 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000);

-- Existing cases become the starting rank's set.
UPDATE cases SET rank_id = (SELECT id FROM ranks WHERE min_xp = 0) WHERE rank_id IS NULL;

-- Better sets for the higher ranks. Same token thresholds, bigger prizes, fewer empty rolls.
-- One statement per case keeps each query small for D1.
INSERT INTO cases (title, note, required_tokens, prizes, sort_order, hidden, created_at, updated_at, rank_id)
SELECT 'Regular basic', NULL, 3, '[{"coins":0,"weight":35},{"coins":10,"weight":35},{"coins":25,"weight":20},{"coins":50,"weight":10}]', 1, 0,
       CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, r.id
FROM ranks r WHERE r.min_xp = 100
  AND NOT EXISTS (SELECT 1 FROM cases c WHERE c.rank_id = r.id AND c.title = 'Regular basic');

INSERT INTO cases (title, note, required_tokens, prizes, sort_order, hidden, created_at, updated_at, rank_id)
SELECT 'Regular silver', NULL, 16, '[{"coins":0,"weight":30},{"coins":50,"weight":35},{"coins":100,"weight":23},{"coins":200,"weight":12}]', 2, 0,
       CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, r.id
FROM ranks r WHERE r.min_xp = 100
  AND NOT EXISTS (SELECT 1 FROM cases c WHERE c.rank_id = r.id AND c.title = 'Regular silver');

INSERT INTO cases (title, note, required_tokens, prizes, sort_order, hidden, created_at, updated_at, rank_id)
SELECT 'Regular gold', NULL, 28, '[{"coins":0,"weight":20},{"coins":150,"weight":35},{"coins":300,"weight":28},{"coins":600,"weight":17}]', 3, 0,
       CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, r.id
FROM ranks r WHERE r.min_xp = 100
  AND NOT EXISTS (SELECT 1 FROM cases c WHERE c.rank_id = r.id AND c.title = 'Regular gold');

INSERT INTO cases (title, note, required_tokens, prizes, sort_order, hidden, created_at, updated_at, rank_id)
SELECT 'Veteran basic', NULL, 3, '[{"coins":0,"weight":25},{"coins":25,"weight":40},{"coins":50,"weight":23},{"coins":100,"weight":12}]', 1, 0,
       CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, r.id
FROM ranks r WHERE r.min_xp = 400
  AND NOT EXISTS (SELECT 1 FROM cases c WHERE c.rank_id = r.id AND c.title = 'Veteran basic');

INSERT INTO cases (title, note, required_tokens, prizes, sort_order, hidden, created_at, updated_at, rank_id)
SELECT 'Veteran silver', NULL, 16, '[{"coins":0,"weight":20},{"coins":100,"weight":40},{"coins":200,"weight":26},{"coins":400,"weight":14}]', 2, 0,
       CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, r.id
FROM ranks r WHERE r.min_xp = 400
  AND NOT EXISTS (SELECT 1 FROM cases c WHERE c.rank_id = r.id AND c.title = 'Veteran silver');

INSERT INTO cases (title, note, required_tokens, prizes, sort_order, hidden, created_at, updated_at, rank_id)
SELECT 'Veteran gold', NULL, 28, '[{"coins":0,"weight":15},{"coins":300,"weight":38},{"coins":600,"weight":30},{"coins":1200,"weight":17}]', 3, 0,
       CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, r.id
FROM ranks r WHERE r.min_xp = 400
  AND NOT EXISTS (SELECT 1 FROM cases c WHERE c.rank_id = r.id AND c.title = 'Veteran gold');

INSERT INTO cases (title, note, required_tokens, prizes, sort_order, hidden, created_at, updated_at, rank_id)
SELECT 'Legend basic', NULL, 3, '[{"coins":0,"weight":15},{"coins":50,"weight":45},{"coins":100,"weight":27},{"coins":200,"weight":13}]', 1, 0,
       CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, r.id
FROM ranks r WHERE r.min_xp = 1000
  AND NOT EXISTS (SELECT 1 FROM cases c WHERE c.rank_id = r.id AND c.title = 'Legend basic');

INSERT INTO cases (title, note, required_tokens, prizes, sort_order, hidden, created_at, updated_at, rank_id)
SELECT 'Legend silver', NULL, 16, '[{"coins":0,"weight":10},{"coins":200,"weight":45},{"coins":400,"weight":30},{"coins":800,"weight":15}]', 2, 0,
       CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, r.id
FROM ranks r WHERE r.min_xp = 1000
  AND NOT EXISTS (SELECT 1 FROM cases c WHERE c.rank_id = r.id AND c.title = 'Legend silver');

INSERT INTO cases (title, note, required_tokens, prizes, sort_order, hidden, created_at, updated_at, rank_id)
SELECT 'Legend gold', NULL, 28, '[{"coins":0,"weight":10},{"coins":600,"weight":40},{"coins":1200,"weight":32},{"coins":2500,"weight":18}]', 3, 0,
       CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, r.id
FROM ranks r WHERE r.min_xp = 1000
  AND NOT EXISTS (SELECT 1 FROM cases c WHERE c.rank_id = r.id AND c.title = 'Legend gold');

-- Default XP amounts. Admins change them on /admin/ranks/.
INSERT OR IGNORE INTO site_settings (key, value, updated_at) VALUES
  ('xp_raffle_entry', '10', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('xp_board_participation', '25', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('xp_board_top1', '150', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('xp_board_top2', '100', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('xp_board_top3', '75', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('xp_board_top10', '30', CAST(strftime('%s','now') AS INTEGER) * 1000);

-- Raffles joined before ranks existed still count.
INSERT OR IGNORE INTO xp_events (kick_user_id, source, source_id, xp, note, created_at)
SELECT e.kick_user_id, 'raffle', e.raffle_id, 10, COALESCE(r.title, 'Raffle'), e.created_at
FROM raffle_entries e LEFT JOIN raffles r ON r.id = e.raffle_id;

-- Boards that already ended before ranks existed do not pay out.
UPDATE leaderboards SET xp_awarded_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE ends_at <= CAST(strftime('%s','now') AS INTEGER) * 1000 AND xp_awarded_at IS NULL;
