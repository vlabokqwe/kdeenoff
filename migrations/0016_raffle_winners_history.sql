-- 0016_raffle_winners_history.sql: Ordered list of winners drawn per raffle (supports multi-winner draws & reset).

CREATE TABLE IF NOT EXISTS raffle_winners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raffle_id INTEGER NOT NULL,
  kick_user_id TEXT,
  winner_name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_raffle_winners_raffle
  ON raffle_winners(raffle_id, id ASC);

INSERT INTO raffle_winners (raffle_id, kick_user_id, winner_name, created_at)
SELECT r.id, NULL, TRIM(r.winner), COALESCE(r.ended_at, r.updated_at, r.created_at, 0)
FROM raffles r
WHERE r.winner IS NOT NULL
  AND TRIM(r.winner) != ''
  AND NOT EXISTS (
    SELECT 1 FROM raffle_winners rw WHERE rw.raffle_id = r.id
  );

