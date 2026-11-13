-- 0010_remove_rewards.sql: Remove tokens, daily cases, ranks/XP, and coin market.
-- Keeps raffle_entries so Kick-linked accounts can still enter raffles.

DROP TABLE IF EXISTS market_purchases;
DROP TABLE IF EXISTS market_items;
DROP TABLE IF EXISTS xp_events;
DROP TABLE IF EXISTS case_opens;
DROP TABLE IF EXISTS cases;
DROP TABLE IF EXISTS ranks;
DROP TABLE IF EXISTS tokens;

DELETE FROM site_settings WHERE key IN (
  'xp_raffle_entry',
  'xp_board_participation',
  'xp_board_top1',
  'xp_board_top2',
  'xp_board_top3',
  'xp_board_top10'
);

ALTER TABLE leaderboards DROP COLUMN xp_awarded_at;

