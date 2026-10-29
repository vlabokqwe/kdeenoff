/**
 * Leaderboard rank spots: prize and visibility keyed by rank, not player id.
 */

export function effectiveSpotHidden(rank, manualHidden, aboveRank) {
  const r = rank != null ? Number(rank) : null;
  if (r == null || r < 1) return { hidden: false, locked: false };
  const manual = !!(Number(manualHidden) || 0);
  const cap = Number(aboveRank);
  const auto = Number.isFinite(cap) && cap > 0 && r > cap;
  return { hidden: manual || auto, locked: auto };
}

export function isRankAutoHiddenByPosition(rank, aboveRank) {
  const r = rank != null ? Number(rank) : null;
  const cap = Number(aboveRank);
  return r != null && r >= 1 && Number.isFinite(cap) && cap > 0 && r > cap;
}

export async function loadSpotPrizes(env, boardId) {
  if (!env.DB) return [];
  try {
    const rs = await env.DB.prepare(
      `SELECT rank, prize_cents, hidden FROM lb_spot_prizes WHERE board_id = ? ORDER BY rank ASC`,
    )
      .bind(boardId)
      .all();
    return rs.results || [];
  } catch (err) {
    return [];
  }
}

export function spotMap(list) {
  const m = new Map();
  for (const s of list || []) {
    const r = Number(s.rank);
    if (!Number.isFinite(r) || r < 1) continue;
    m.set(r, {
      prize_cents: Math.max(0, Math.floor(Number(s.prize_cents) || 0)),
      hidden: !!(Number(s.hidden) || 0),
    });
  }
  return m;
}

export async function spotRanksForBoard(env, boardId) {
  const list = await loadSpotPrizes(env, boardId);
  return list.map((s) => Number(s.rank)).filter((r) => Number.isFinite(r) && r >= 1);
}

export function mergePlayerSpots(players, map, opts = {}) {
  const cap = opts.autoHiddenAboveRank;
  return (players || []).map((p) => {
    const rank = p.rank != null ? Number(p.rank) : null;
    const spot = rank != null ? map.get(rank) : null;
    const prize_cents = spot ? spot.prize_cents : p.prize_cents || 0;
    const manualHidden = spot ? spot.hidden : false;
    const { hidden: spot_hidden, locked: spot_hidden_locked } = effectiveSpotHidden(
      rank,
      manualHidden,
      cap,
    );
    return {
      ...p,
      prize_cents,
      spot_hidden: spot_hidden ? 1 : 0,
      spot_hidden_locked: spot_hidden_locked ? 1 : 0,
    };
  });
}

export function isPlayerSpotVisible(player, map, autoHiddenAboveRank) {
  const rank = player.rank != null ? Number(player.rank) : null;
  if (rank == null || rank < 1) return true;
  const manual = map.get(rank)?.hidden ?? false;
  return !effectiveSpotHidden(rank, manual, autoHiddenAboveRank).hidden;
}

export function buildPublicBoardPlayers(visiblePlayers, map, opts = {}) {
  const merged = mergePlayerSpots(visiblePlayers, map, opts);
  const cap = Number(opts.autoHiddenAboveRank);
  if (!Number.isFinite(cap) || cap <= 0) return merged;

  const playersByRank = new Map();
  const unranked = [];
  for (const p of merged) {
    const rank = p.rank != null ? Number(p.rank) : null;
    if (rank != null && rank >= 1) {
      if (!playersByRank.has(rank)) playersByRank.set(rank, p);
    } else {
      unranked.push(p);
    }
  }

  const rows = [];
  const floorCap = Math.floor(cap);
  for (let rank = 1; rank <= floorCap; rank++) {
    const player = playersByRank.get(rank);
    if (player) {
      rows.push(player);
      continue;
    }
    const spot = map.get(rank);
    const manualHidden = spot?.hidden ?? false;
    const { hidden } = effectiveSpotHidden(rank, manualHidden, cap);
    if (hidden) continue;
    rows.push({
      id: null,
      rank,
      username: "—",
      wagered_cents: 0,
      prize_cents: spot?.prize_cents ?? 0,
      avatar_url: null,
      empty_spot: 1,
    });
  }

  rows.push(...unranked);
  return rows;
}

export async function upsertSpotPrize(env, boardId, rank, prizeCents) {
  const p = Math.max(0, Math.floor(Number(prizeCents) || 0));
  await env.DB.prepare(
    `INSERT INTO lb_spot_prizes (board_id, rank, prize_cents, hidden)
     VALUES (?, ?, ?, 0)
     ON CONFLICT(board_id, rank) DO UPDATE SET prize_cents = excluded.prize_cents`,
  )
    .bind(boardId, rank, p)
    .run();
}

export async function upsertSpotHidden(env, boardId, rank, hidden) {
  const h = hidden ? 1 : 0;
  await env.DB.prepare(
    `INSERT INTO lb_spot_prizes (board_id, rank, prize_cents, hidden)
     VALUES (?, ?, 0, ?)
     ON CONFLICT(board_id, rank) DO UPDATE SET hidden = excluded.hidden`,
  )
    .bind(boardId, rank, h)
    .run();
}
