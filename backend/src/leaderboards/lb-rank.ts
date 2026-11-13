/**
 * Re-assign rank + sort_order by wagered_cents DESC, id ASC.
 */
import type { DatabaseService } from "../database/database.service";

export function rankPlayersByWagered(db: DatabaseService, boardId: number): number {
  const players = db.all<{ id: number }>(
    `SELECT id FROM lb_players WHERE board_id = ?
     ORDER BY wagered_cents DESC, id ASC`,
    boardId,
  );
  const stmts = players.map((p, i) =>
    db.stmt(`UPDATE lb_players SET rank = ?, sort_order = ? WHERE id = ?`, i + 1, i + 1, p.id),
  );
  if (stmts.length) db.batch(stmts);
  return stmts.length;
}
