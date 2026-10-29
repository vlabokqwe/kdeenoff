-- 0002_seed.sql: Seed active KDeenOff Monthly Leaderboard

INSERT OR IGNORE INTO leaderboards (
  id, slug, title, subtitle, starts_at, ends_at, prize_pool_cents,
  hidden, archived, partner_signup_url, partner, avatar_style,
  auto_rank_by_wagered, auto_wager_growth_enabled, auto_wager_growth_pct,
  auto_wager_growth_interval_ms, auto_hidden_above_rank, created_at, updated_at
) VALUES (
  1,
  'kdeenoff-monthly',
  'KDeenOff $10,000 Monthly Race',
  'Spin the reels, climb the podium and secure your slice of the monthly jackpot.',
  1761800000000, -- Oct 2026
  1764500000000, -- Nov 2026
  1000000,       -- $10,000.00 in cents
  0,             -- hidden
  0,             -- archived
  'https://stake.com/?c=KDEENOFF',
  'stake',
  'fun-emoji',
  1,             -- auto_rank_by_wagered
  1,             -- auto_wager_growth_enabled
  4,             -- 4%
  21600000,      -- 6 hours
  25,            -- auto_hidden_above_rank
  1761800000000,
  1761800000000
);

-- Seed spot prizes for Top 10
INSERT OR REPLACE INTO lb_spot_prizes (board_id, rank, prize_cents, hidden) VALUES
  (1, 1, 350000, 0), -- $3,500 1st place
  (1, 2, 200000, 0), -- $2,000 2nd place
  (1, 3, 120000, 0), -- $1,200 3rd place
  (1, 4, 80000, 0),  -- $800
  (1, 5, 60000, 0),  -- $600
  (1, 6, 50000, 0),  -- $500
  (1, 7, 45000, 0),  -- $450
  (1, 8, 35000, 0),  -- $350
  (1, 9, 30000, 0),  -- $300
  (1, 10, 30000, 0); -- $300

-- Seed Top 10 sample players
INSERT OR REPLACE INTO lb_players (
  board_id, rank, sort_order, username, wagered_cents, prize_cents,
  avatar_url, avatar_sid, wag_growth_enabled, wag_growth_pct, wag_growth_hours
) VALUES
  (1, 1, 1, 'TurboSnail77', 8425000, 350000, NULL, 'turbosnail77', 1, 5, 6),
  (1, 2, 2, 'LuckySpinX', 6120000, 200000, NULL, 'luckyspinx', 1, 4, 6),
  (1, 3, 3, 'KDeenChampion', 4890000, 120000, NULL, 'kdeenchampion', 1, 4, 6),
  (1, 4, 4, 'HighRoller99', 3420000, 80000, NULL, 'highroller99', 1, 3, 8),
  (1, 5, 5, 'GoldenShell', 2780000, 60000, NULL, 'goldenshell', 1, 3, 8),
  (1, 6, 6, 'CryptoGanja', 2150000, 50000, NULL, 'cryptoganja', 1, 3, 12),
  (1, 7, 7, 'ReelMaster', 1650000, 45000, NULL, 'reelmaster', 1, 2, 12),
  (1, 8, 8, 'SlotVibes', 1280000, 35000, NULL, 'slotvibes', 1, 2, 12),
  (1, 9, 9, 'NeonBonus', 940000, 30000, NULL, 'neonbonus', 1, 2, 24),
  (1, 10, 10, 'SpinKingz', 720000, 30000, NULL, 'spinkingz', 1, 2, 24);

-- Seed initial site settings
INSERT OR REPLACE INTO site_settings (key, value, updated_at) VALUES
  ('promo_code', 'KDEENOFF', 1761800000000),
  ('partner_name', 'Stake', 1761800000000),
  ('partner_signup_url', 'https://stake.com/?c=KDEENOFF', 1761800000000),
  ('headline_prize', '$10,000', 1761800000000),
  ('kick_channel', 'KDeenOff', 1761800000000),
  ('kick_url', 'https://kick.com/kdeenoff', 1761800000000),
  ('telegram_url', 'https://t.me/kdeenoff', 1761800000000);
