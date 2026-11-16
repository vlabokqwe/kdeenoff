/**
 * Public leaderboard & site read endpoints.
 *   GET /api/site                         -> public site settings
 *   GET /api/leaderboards                 -> list of visible boards
 *   GET /api/leaderboards/avatar/:seed    -> generated KDeenOff monkey collector SVG avatar
 *   GET /api/leaderboards/history         -> past/archived boards
 *   GET /api/leaderboards/:slug           -> one board with its players & prizes
 */
import { Injectable } from "@nestjs/common";
import { sha256Hex } from "../common/crypto";
import { type HttpResult, jsonResponse, notFound } from "../common/http/response";
import { isValidSlug } from "../common/validation";
import { DatabaseService, type Row } from "../database/database.service";
import {
  buildLeaderboardAvatarUrl,
  normalizeKickHandle,
  renderLeaderboardAvatarSvg,
} from "./lb-avatar";
import {
  buildPublicBoardPlayers,
  isPlayerSpotVisible,
  loadSpotPrizes,
  spotMap,
} from "./lb-spot-prizes";
import { formatLbUsername } from "./lb-username";

const PUBLIC_SITE_SETTING_KEYS = [
  "promo_code",
  "partner_name",
  "partner_signup_url",
  "headline_prize",
  "kick_channel",
  "kick_url",
  "telegram_url",
] as const;

function resolveAvatarUrl(player: Row, board: Row): string {
  const style = String(board.avatar_style || "kdeenoff").trim().toLowerCase();
  if (style === "none") return "";
  const custom = player.avatar_url ? String(player.avatar_url).trim() : "";
  if (custom && !custom.includes("dicebear.com")) {
    return custom;
  }
  const rawIdentity = normalizeKickHandle(
    player.username || player.avatar_sid || player.id || "player",
  );
  const opaqueSeed = sha256Hex(`lb-avatar-v1:${rawIdentity}`).slice(0, 16);
  return buildLeaderboardAvatarUrl(opaqueSeed, style);
}

@Injectable()
export class LeaderboardsService {
  constructor(private readonly db: DatabaseService) {}

  async handleGetSiteSettings(): Promise<HttpResult> {
    try {
      const placeholders = PUBLIC_SITE_SETTING_KEYS.map(() => "?").join(", ");
      const rows = await this.db.all<{ key: string; value: string }>(
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

  async handleListBoards(): Promise<HttpResult> {
    try {
      const now = Date.now();
      const boards = await this.db.all(
        `SELECT slug, title, subtitle, starts_at, ends_at, updated_at, prize_pool_cents,
                partner_signup_url, partner, avatar_style,
                badge, promo_code, show_in_drawer, show_on_home
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

  async handleGetBoard(
    slug: string,
    opts?: { includeHidden?: boolean; viewerHandles?: ReadonlySet<string> },
  ): Promise<HttpResult> {
    if (!isValidSlug(slug)) return notFound();

    const boardRs = await this.db.first(
      `SELECT id, slug, title, subtitle, starts_at, ends_at, updated_at, prize_pool_cents,
              archived, partner_signup_url, partner, avatar_style,
              auto_rank_by_wagered, auto_hidden_above_rank, badge, promo_code,
              show_in_drawer, show_on_home
       FROM leaderboards WHERE slug = ?${opts?.includeHidden ? "" : " AND hidden = 0"}`,
      slug,
    );

    if (!boardRs) return notFound();

    const viewerHandles = opts?.viewerHandles;

    const spots = await loadSpotPrizes(this.db, Number(boardRs.id));
    const spotsM = spotMap(spots);
    const publicSpots = spots
      .filter((s) => !Number(s.hidden))
      .map((s) => ({
        rank: Number(s.rank),
        prize_cents: Math.max(0, Math.floor(Number(s.prize_cents) || 0)),
      }));

    const autoRank = Number(boardRs.auto_rank_by_wagered) !== 0;
    const rawPlayers = await this.db.all(
      autoRank
        ? `SELECT id, rank, sort_order, username, wagered_cents, prize_cents, avatar_url, avatar_sid
           FROM lb_players WHERE board_id = ?
           ORDER BY wagered_cents DESC, sort_order ASC, id ASC`
        : `SELECT id, rank, sort_order, username, wagered_cents, prize_cents, avatar_url, avatar_sid
           FROM lb_players WHERE board_id = ?
           ORDER BY sort_order ASC, wagered_cents DESC, id ASC`,
      boardRs.id,
    );

    const rankedPlayers: Row[] = rawPlayers.map((p, idx) => ({
      ...p,
      rank: autoRank ? idx + 1 : p.rank || idx + 1,
    }));

    const visible = rankedPlayers
      .filter((p) => isPlayerSpotVisible(p, spotsM, boardRs.auto_hidden_above_rank))
      .map((p) => {
        const normName = normalizeKickHandle(p.username);
        const isYou = Boolean(normName && viewerHandles?.has(normName));
        const masked = formatLbUsername(p.username);
        const item: Row = {
          rank: p.rank,
          username: masked,
          display_name: masked,
          wagered_cents: p.wagered_cents,
          prize_cents: p.prize_cents,
          avatar_url: resolveAvatarUrl(p, boardRs),
        };
        if (isYou) item.is_you = true;
        return item;
      });

    const publicPlayers = buildPublicBoardPlayers(visible, spotsM, {
      autoHiddenAboveRank: boardRs.auto_hidden_above_rank,
    });

    const publicBoard = {
      slug: boardRs.slug,
      title: boardRs.title,
      subtitle: boardRs.subtitle,
      starts_at: boardRs.starts_at,
      ends_at: boardRs.ends_at,
      updated_at: boardRs.updated_at,
      archived: boardRs.archived,
      prize_pool_cents: boardRs.prize_pool_cents,
      partner_signup_url: boardRs.partner_signup_url,
      partner: boardRs.partner,
      avatar_style: boardRs.avatar_style,
      badge: boardRs.badge,
      promo_code: boardRs.promo_code,
      show_in_drawer: boardRs.show_in_drawer,
      show_on_home: boardRs.show_on_home,
    };

    return jsonResponse({
      board: publicBoard,
      players: publicPlayers,
      spots: publicSpots,
    });
  }

  async handleListHistory(): Promise<HttpResult> {
    try {
      const boards = await this.db.all(
        `SELECT slug, title, subtitle, starts_at, ends_at, updated_at, archived, prize_pool_cents,
                partner, partner_signup_url, avatar_style, badge, promo_code
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
