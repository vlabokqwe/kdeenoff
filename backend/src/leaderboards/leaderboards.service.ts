/**
 * Public leaderboard & site read endpoints.
 *   GET /api/site                         -> public site settings
 *   GET /api/leaderboards                 -> list of visible boards
 *   GET /api/leaderboards/avatar/:seed    -> generated KDeenOff monkey collector SVG avatar
 *   GET /api/leaderboards/history         -> past/archived boards
 *   GET /api/leaderboards/:slug           -> one board with its players & prizes
 */
import { Injectable } from "@nestjs/common";
import { type HttpResult, jsonResponse, notFound } from "../common/http/response";
import { isValidSlug } from "../common/validation";
import { DatabaseService, type Row } from "../database/database.service";
import {
  buildLeaderboardAvatarUrl,
  buildNeutralAvatarUrl,
  loadAuthorizedKickNames,
  normalizeKickHandle,
  renderLeaderboardAvatarSvg,
} from "./lb-avatar";
import {
  buildPublicBoardPlayers,
  isPlayerSpotVisible,
  loadSpotPrizes,
  spotMap,
} from "./lb-spot-prizes";
import { maskLbUsername } from "./lb-username";

const PUBLIC_SITE_SETTING_KEYS = [
  "promo_code",
  "partner_name",
  "partner_signup_url",
  "headline_prize",
  "kick_channel",
  "kick_url",
  "telegram_url",
] as const;

function resolveAvatarUrl(player: Row, board: Row, isRegistered: boolean): string {
  const style = String(board.avatar_style || "kdeenoff").trim().toLowerCase();
  if (style === "none") return "";
  const custom = player.avatar_url ? String(player.avatar_url).trim() : "";
  if (custom && !custom.includes("dicebear.com")) {
    return custom;
  }
  if (isRegistered) {
    const seed = player.username || player.avatar_sid || player.id || "player";
    return buildLeaderboardAvatarUrl(seed, style);
  }
  return buildNeutralAvatarUrl(style);
}

@Injectable()
export class LeaderboardsService {
  constructor(private readonly db: DatabaseService) {}

  handleGetSiteSettings(): HttpResult {
    try {
      const placeholders = PUBLIC_SITE_SETTING_KEYS.map(() => "?").join(", ");
      const rows = this.db.all<{ key: string; value: string }>(
        `SELECT key, value FROM site_settings WHERE key IN (${placeholders})`,
        ...PUBLIC_SITE_SETTING_KEYS,
      );
      const settings: Record<string, string> = {};
      for (const r of rows) {
        settings[r.key] = r.value;
      }
      return jsonResponse({ settings });
    } catch {
      return jsonResponse({ settings: {} });
    }
  }

  handleGetAvatar(seed: string, presetRaw?: string): HttpResult {
    const raw = String(presetRaw || "").trim().toLowerCase();
    const preset =
      raw === "neutral"
        ? "neutral"
        : raw === "gold" || raw === "luxe"
          ? "luxe"
          : raw === "camo"
            ? "camo"
            : "default";
    const svg = renderLeaderboardAvatarSvg(seed, { preset });
    return {
      status: 200,
      headers: [
        ["content-type", "image/svg+xml; charset=utf-8"],
        ["cache-control", "public, max-age=86400"],
        ["x-content-type-options", "nosniff"],
        ["content-security-policy", "default-src 'none'"],
      ],
      body: svg,
    };
  }

  handleListBoards(): HttpResult {
    try {
      const now = Date.now();
      const boards = this.db.all(
        `SELECT id, slug, title, subtitle, starts_at, ends_at, prize_pool_cents,
                partner_signup_url, partner, avatar_style,
                badge, promo_code, sort_order, show_in_drawer, show_on_home, is_demo
         FROM leaderboards
         WHERE hidden = 0 AND archived = 0
         ORDER BY CASE WHEN ends_at > ? THEN 0 ELSE 1 END ASC,
                  sort_order ASC,
                  CASE WHEN ends_at > ? THEN ends_at ELSE -ends_at END ASC,
                  id DESC`,
        now,
        now,
      );
      return jsonResponse({ boards });
    } catch {
      return jsonResponse({ boards: [] });
    }
  }

  handleGetBoard(slug: string, opts?: { includeHidden?: boolean }): HttpResult {
    if (!isValidSlug(slug)) return notFound();

    const boardRs = this.db.first(
      `SELECT id, slug, title, subtitle, starts_at, ends_at, prize_pool_cents,
              hidden, archived, partner_signup_url, partner, avatar_style,
              auto_hidden_above_rank, badge, promo_code, sort_order,
              show_in_drawer, show_on_home, is_demo
       FROM leaderboards WHERE slug = ?${opts?.includeHidden ? "" : " AND hidden = 0"}`,
      slug,
    );

    if (!boardRs) return notFound();

    const spots = loadSpotPrizes(this.db, Number(boardRs.id));
    const spotsM = spotMap(spots);

    const rawPlayers = this.db.all(
      `SELECT id, rank, sort_order, username, wagered_cents, prize_cents, avatar_url, avatar_sid
       FROM lb_players WHERE board_id = ?
       ORDER BY sort_order ASC, wagered_cents DESC, id ASC`,
      boardRs.id,
    );

    const registeredNames = loadAuthorizedKickNames(
      this.db,
      rawPlayers.map((p) => String(p.username || "")),
    );

    const visible = rawPlayers
      .filter((p) => isPlayerSpotVisible(p, spotsM, boardRs.auto_hidden_above_rank))
      .map((p) => {
        const isRegistered = registeredNames.has(normalizeKickHandle(p.username));
        return {
          id: p.id,
          rank: p.rank,
          username: p.username,
          display_name: maskLbUsername(p.username),
          wagered_cents: p.wagered_cents,
          prize_cents: p.prize_cents,
          avatar_url: resolveAvatarUrl(p, boardRs, isRegistered),
        };
      });

    const publicPlayers = buildPublicBoardPlayers(visible, spotsM, {
      autoHiddenAboveRank: boardRs.auto_hidden_above_rank,
    });

    return jsonResponse({
      board: boardRs,
      players: publicPlayers,
      spots,
    });
  }

  handleListHistory(): HttpResult {
    try {
      const boards = this.db.all(
        `SELECT id, slug, title, subtitle, starts_at, ends_at, prize_pool_cents,
                partner, partner_signup_url, avatar_style, badge, promo_code, is_demo
         FROM leaderboards
         WHERE hidden = 0 AND (archived = 1 OR ends_at <= ?)
         ORDER BY ends_at DESC`,
        Date.now(),
      );
      return jsonResponse({ boards });
    } catch {
      return jsonResponse({ boards: [] });
    }
  }
}
