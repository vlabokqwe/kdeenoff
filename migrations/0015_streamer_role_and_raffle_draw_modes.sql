-- 0015_streamer_role_and_raffle_draw_modes.sql: Streamer user role + raffle spin modes (winner vs elimination), reroll & entry-lock settings.

ALTER TABLE site_people ADD COLUMN role TEXT NOT NULL DEFAULT 'player';

ALTER TABLE raffles ADD COLUMN spin_mode TEXT NOT NULL DEFAULT 'winner';
ALTER TABLE raffles ADD COLUMN spin_speed TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE raffles ADD COLUMN exclude_prev_winner INTEGER NOT NULL DEFAULT 1;
ALTER TABLE raffles ADD COLUMN entries_locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE raffles ADD COLUMN last_eliminated TEXT;
ALTER TABLE raffles ADD COLUMN last_spin_at INTEGER;
ALTER TABLE raffles ADD COLUMN last_spin_kind TEXT;

ALTER TABLE raffle_entries ADD COLUMN eliminated_at INTEGER;
ALTER TABLE raffle_entries ADD COLUMN eliminated_order INTEGER;

