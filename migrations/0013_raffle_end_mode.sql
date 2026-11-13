-- 0013_raffle_end_mode.sql: Add end_mode ('timer' | 'manual') and ended_at to raffles.

ALTER TABLE raffles ADD COLUMN end_mode TEXT NOT NULL DEFAULT 'timer';
ALTER TABLE raffles ADD COLUMN ended_at INTEGER;

-- Seed a demo manual-draw raffle alongside existing demo data so both modes can be previewed.
INSERT INTO raffles (
  title, prize, note, winner, starts_at, ends_at, end_mode, ended_at, hidden, is_demo, created_at, updated_at
)
SELECT
  'Live Stream $250 Drop',
  '$250 Cash',
  'Follow KDeenOff on Kick | One entry per Kick account | Streamer draws live on stream',
  NULL,
  (unixepoch() * 1000) - 1800000,
  4102444800000,
  'manual',
  NULL,
  0,
  1,
  unixepoch() * 1000,
  unixepoch() * 1000
WHERE (SELECT COUNT(*) FROM raffles WHERE is_demo = 1) > 0
  AND (SELECT COUNT(*) FROM raffles WHERE end_mode = 'manual') = 0;
