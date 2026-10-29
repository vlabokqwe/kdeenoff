/**
 * Public leaderboard read endpoints.
 *   GET /api/leaderboards          -> list of visible boards
 *   GET /api/leaderboards/:slug    -> one board with its players & prizes
 *   GET /api/leaderboards/history  -> past/archived boards
 */
import { jsonResponse, notFound } from "../lib/response.js";
import { isValidSlug } from "../lib/validation.js";
import {
  buildPublicBoardPlayers,
  isPlayerSpotVisible,
  loadSpotPrizes,
  spotMap,
} from "../lib/lb-spot-prizes.js";
import { maskLbUsername } from "../lib/lb-username.js";

const DICEBEAR_FUN_EMOJI = "https://api.dicebear.com/9.x/fun-emoji/svg";
const DICEBEAR_BOTTTS_NEUTRAL = "https://api.dicebear.com/9.x/bottts-neutral/svg";

function strHash(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

function resolveAvatarUrl(player, board) {
  const custom = player.avatar_url && String(player.avatar_url).trim();
  if (custom) return custom;
  const style = board.avatar_style || "auto";
  if (style === "none") return "";
  const seed = player.avatar_sid || player.username || String(player.id || "player");
  if (style === "bottts-neutral") {
    return `${DICEBEAR_BOTTTS_NEUTRAL}?seed=${strHash(seed)}`;
  }
  // Default: fun-emoji
  return `${DICEBEAR_FUN_EMOJI}?seed=${strHash(seed)}`;
}

export async function handleListBoards(env) {
  if (!env.DB) return jsonResponse({ boards: [] });
  try {
    const rs = await env.DB.prepare(
      `SELECT id, slug, title, subtitle, starts_at, ends_at, prize_pool_cents,
              partner_signup_url, partner, avatar_style
       FROM leaderboards
       WHERE hidden = 0 AND archived = 0
       ORDER BY ends_at ASC, id DESC`,
    ).all();
    return jsonResponse({ boards: rs.results || [] });
  } catch (e) {
    return jsonResponse({ boards: [] });
  }
}

export async function handleGetBoard(env, slug) {
  if (!isValidSlug(slug)) return notFound();
  if (!env.DB) return notFound();

  const boardRs = await env.DB.prepare(
    `SELECT id, slug, title, subtitle, starts_at, ends_at, prize_pool_cents,
            hidden, archived, partner_signup_url, partner, avatar_style,
            auto_hidden_above_rank
     FROM leaderboards WHERE slug = ?`,
  )
    .bind(slug)
    .first();

  if (!boardRs) return notFound();

  // Load spot prizes
  const spots = await loadSpotPrizes(env, boardRs.id);
  const spotsM = spotMap(spots);

  // Load players
  const playersRs = await env.DB.prepare(
    `SELECT id, rank, sort_order, username, wagered_cents, prize_cents, avatar_url, avatar_sid
     FROM lb_players WHERE board_id = ?
     ORDER BY sort_order ASC, wagered_cents DESC, id ASC`,
  )
    .bind(boardRs.id)
    .all();

  const rawPlayers = playersRs.results || [];

  // Filter visible spots and assign avatars
  const visible = rawPlayers
    .filter((p) => isPlayerSpotVisible(p, spotsM, boardRs.auto_hidden_above_rank))
    .map((p) => ({
      id: p.id,
      rank: p.rank,
      username: p.username,
      display_name: maskLbUsername(p.username),
      wagered_cents: p.wagered_cents,
      prize_cents: p.prize_cents,
      avatar_url: resolveAvatarUrl(p, boardRs),
    }));

  const publicPlayers = buildPublicBoardPlayers(visible, spotsM, {
    autoHiddenAboveRank: boardRs.auto_hidden_above_rank,
  });

  return jsonResponse({
    board: boardRs,
    players: publicPlayers,
    spots,
  });
}

export async function handleListHistory(env) {
  if (!env.DB) return jsonResponse({ boards: [] });
  try {
    const rs = await env.DB.prepare(
      `SELECT id, slug, title, subtitle, starts_at, ends_at, prize_pool_cents, partner
       FROM leaderboards
       WHERE archived = 1 OR ends_at < ?
       ORDER BY ends_at DESC`,
    )
      .bind(Date.now())
      .all();
    return jsonResponse({ boards: rs.results || [] });
  } catch (e) {
    return jsonResponse({ boards: [] });
  }
}
