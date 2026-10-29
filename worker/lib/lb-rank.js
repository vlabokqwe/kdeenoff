/**
 * Re-assign rank + sort_order by wagered_cents DESC, id ASC.
 * @param {any} env
 * @param {number} boardId
 * @returns {Promise<number>} rows updated
 */
export async function rankPlayersByWagered(env, boardId) {
  const players = await env.DB.prepare(
    `SELECT id FROM lb_players WHERE board_id = ?
     ORDER BY wagered_cents DESC, id ASC`,
  )
    .bind(boardId)
    .all();
  const list = players.results || [];
  const stmts = list.map((p, i) =>
    env.DB.prepare(`UPDATE lb_players SET rank = ?, sort_order = ? WHERE id = ?`).bind(
      i + 1,
      i + 1,
      p.id,
    ),
  );
  if (stmts.length) await env.DB.batch(stmts);
  return stmts.length;
}
