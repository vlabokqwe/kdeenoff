-- 0012_leaderboard_placements_and_demo.sql: Leaderboard placement metadata & demo-data binding

ALTER TABLE leaderboards ADD COLUMN badge TEXT NOT NULL DEFAULT '';
ALTER TABLE leaderboards ADD COLUMN promo_code TEXT NOT NULL DEFAULT '';
ALTER TABLE leaderboards ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leaderboards ADD COLUMN show_in_drawer INTEGER NOT NULL DEFAULT 1;
ALTER TABLE leaderboards ADD COLUMN show_on_home INTEGER NOT NULL DEFAULT 1;
ALTER TABLE leaderboards ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;

ALTER TABLE raffles ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_leaderboards_placement ON leaderboards(hidden, archived, sort_order);

-- Bind existing kdeenoff-monthly seed board as demo & configure placements
UPDATE leaderboards
SET is_demo = 1,
    badge = 'MONTHLY',
    promo_code = 'KDEENOFF',
    sort_order = 0,
    show_in_drawer = 1,
    show_on_home = 1,
    avatar_style = CASE
      WHEN avatar_style IN ('fun-emoji', 'auto', '') THEN 'olympus'
      ELSE avatar_style
    END
WHERE slug = 'kdeenoff-monthly';

-- Refresh expired 2025 seed dates on kdeenoff-monthly
UPDATE leaderboards
SET starts_at = (unixepoch() * 1000) - 259200000,
    ends_at = (unixepoch() * 1000) + 2332800000,
    updated_at = (unixepoch() * 1000)
WHERE slug = 'kdeenoff-monthly' AND ends_at <= 1765000000000;

-- Clear hardcoded player prize_cents on kdeenoff-monthly (lb_spot_prizes ranks 1..10 control prizes)
UPDATE lb_players
SET prize_cents = 0,
    wag_growth_last_at = COALESCE(wag_growth_last_at, unixepoch() * 1000)
WHERE board_id = (SELECT id FROM leaderboards WHERE slug = 'kdeenoff-monthly');

-- Seed second live demo leaderboard: kdeenoff-weekly
INSERT OR IGNORE INTO leaderboards (
  slug, title, subtitle, starts_at, ends_at, prize_pool_cents,
  hidden, archived, partner_signup_url, partner, avatar_style,
  auto_rank_by_wagered, auto_wager_growth_enabled, auto_wager_growth_pct,
  auto_wager_growth_interval_ms, auto_hidden_above_rank,
  badge, promo_code, sort_order, show_in_drawer, show_on_home, is_demo,
  created_at, updated_at
) VALUES (
  'kdeenoff-weekly',
  'KDeenOff $2,500 Weekly Sprint',
  'Weekly wager sprint — top 5 split $2,500 every Sunday.',
  (unixepoch() * 1000) - 86400000,
  (unixepoch() * 1000) + 518400000,
  250000,
  0,
  0,
  'https://stake.com/?c=KDEENOFF',
  'stake',
  'olympus-gold',
  1,
  1,
  3,
  21600000,
  15,
  'WEEKLY',
  'KDEENOFF',
  1,
  1,
  1,
  1,
  unixepoch() * 1000,
  unixepoch() * 1000
);

-- Seed Top 5 spot prizes for kdeenoff-weekly
WITH s(rank, prize_cents) AS (
  VALUES
    (1, 100000),
    (2, 60000),
    (3, 40000),
    (4, 30000),
    (5, 20000)
)
INSERT OR IGNORE INTO lb_spot_prizes (board_id, rank, prize_cents, hidden)
SELECT l.id, s.rank, s.prize_cents, 0
FROM leaderboards l
CROSS JOIN s
WHERE l.slug = 'kdeenoff-weekly';

-- Seed 6 sample players for kdeenoff-weekly only when it has 0 players
WITH p(rank, username, wagered_cents) AS (
  VALUES
    (1, 'ZeusStrike', 1840000),
    (2, 'VampHunter', 1420000),
    (3, 'RaccoonVIP', 1090000),
    (4, 'OlympusKing', 830000),
    (5, 'NeonDrifter', 610000),
    (6, 'LuckyBolt', 420000)
)
INSERT INTO lb_players (
  board_id, rank, sort_order, username, wagered_cents, prize_cents,
  avatar_url, avatar_sid, wag_growth_enabled, wag_growth_pct, wag_growth_hours, wag_growth_last_at
)
SELECT
  l.id,
  p.rank,
  p.rank,
  p.username,
  p.wagered_cents,
  0,
  NULL,
  lower(p.username),
  1,
  3,
  6,
  unixepoch() * 1000
FROM leaderboards l
CROSS JOIN p
WHERE l.slug = 'kdeenoff-weekly'
  AND (SELECT COUNT(*) FROM lb_players WHERE board_id = l.id) = 0;

-- Bind demo raffles & refresh expired ones
UPDATE raffles
SET is_demo = 1
WHERE title = 'Weekly $500 Raffle' OR title LIKE 'Weekly $500 Raffle %';

UPDATE raffles
SET starts_at = (unixepoch() * 1000) - 3600000,
    ends_at = (unixepoch() * 1000) + 604800000,
    updated_at = unixepoch() * 1000
WHERE is_demo = 1
  AND winner IS NULL
  AND ends_at <= (unixepoch() * 1000);

INSERT INTO raffles (
  title, prize, note, winner, starts_at, ends_at, hidden, is_demo, created_at, updated_at
)
SELECT
  'Weekly $500 Raffle',
  '$500',
  'One entry per Kick account.',
  NULL,
  (unixepoch() * 1000) - 3600000,
  (unixepoch() * 1000) + 604800000,
  0,
  1,
  unixepoch() * 1000,
  unixepoch() * 1000
WHERE (SELECT COUNT(*) FROM raffles) = 0;
