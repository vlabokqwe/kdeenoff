-- 0017_raffle_spin_duration_ms.sql: Configurable spin duration in milliseconds (presets + custom seconds).

ALTER TABLE raffles ADD COLUMN spin_duration_ms INTEGER NOT NULL DEFAULT 4000;

UPDATE raffles
SET spin_duration_ms = CASE
  WHEN spin_speed = 'instant' THEN 0
  WHEN spin_speed = 'fast' THEN 2000
  ELSE 4000
END;

