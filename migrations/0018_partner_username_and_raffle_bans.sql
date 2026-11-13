-- 0018_partner_username_and_raffle_bans.sql: Partner site username on profiles & raffle bans / timeouts.

ALTER TABLE site_people ADD COLUMN partner_username TEXT;
ALTER TABLE kick_accounts ADD COLUMN partner_username TEXT;

CREATE TABLE IF NOT EXISTS raffle_bans (
  kick_user_id TEXT PRIMARY KEY,
  is_permanent INTEGER NOT NULL DEFAULT 0,
  banned_until INTEGER,
  reason TEXT,
  actor_email TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_raffle_bans_until ON raffle_bans(banned_until);

UPDATE kick_accounts
SET partner_username = name || '_500'
WHERE partner_username IS NULL
  AND (kick_user_id LIKE 'demo-bot-%' OR kick_user_id = 'local-demo')
  AND name IS NOT NULL
  AND TRIM(name) != '';

UPDATE site_people
SET partner_username = 'kdeenoff_500'
WHERE partner_username IS NULL
  AND (email = 'local@kdeenoff.test' OR kick_user_id = 'local-demo');

