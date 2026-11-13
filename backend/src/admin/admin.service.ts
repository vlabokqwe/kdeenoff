/**
 * Admin API for KDeenOff.
 */
import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { type Actor, AuditService } from "../audit/audit.module";
import { randomB64url } from "../common/crypto";
import { verifyCsrf, verifySameOrigin } from "../common/csrf";
import { readBody } from "../common/http/read-body";
import { normalizedPath, searchParams } from "../common/http/request";
import {
  type HttpResult,
  badRequest,
  forbidden,
  jsonResponse,
  notFound,
} from "../common/http/response";
import {
  asBool,
  asInt,
  asString,
  asTrimmed,
  isValidSlug,
  toSlug,
} from "../common/validation";
import {
  clampWagerGrowthIntervalMs,
  clampWagerGrowthPct,
} from "../common/wager-growth-schedule";
import { DatabaseService, type BoundStatement } from "../database/database.service";
import {
  buildLeaderboardAvatarUrl,
  buildNeutralAvatarUrl,
  loadAuthorizedKickNames,
  normalizeKickHandle,
} from "../leaderboards/lb-avatar";
import { rankPlayersByWagered } from "../leaderboards/lb-rank";
import {
  loadSpotPrizes,
  upsertSpotHidden,
  upsertSpotPrize,
} from "../leaderboards/lb-spot-prizes";
import { RafflesService } from "../raffles/raffles.service";
import { normalizeUserRole, type UserRole } from "../session/session.service";
import { WagerGrowthService } from "../wager-growth/wager-growth.service";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      cur = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else if (c !== "\r") {
      cur += c;
    }
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

function parseCsvMoneyCents(raw: unknown, inCents: boolean): number {
  const clean = String(raw ?? "").replace(/[$,\s]/g, "").trim();
  if (!clean) return 0;
  const num = Number(clean);
  if (!Number.isFinite(num) || num < 0) return 0;
  return inCents ? Math.round(num) : Math.round(num * 100);
}

@Injectable()
export class AdminService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly wagerGrowth: WagerGrowthService,
    private readonly raffles: RafflesService,
  ) { }

  async handleAdmin(req: Request, actor: Actor): Promise<HttpResult> {
    const csrf = verifyCsrf(req);
    if (!csrf.ok) return forbidden(csrf.error);
    const m = req.method.toUpperCase();
    if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") {
      if ((req.get("origin") || req.get("sec-fetch-site")) && !verifySameOrigin(req)) {
        return forbidden("origin");
      }
    }

    let decoded = normalizedPath(req);
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      return notFound();
    }
    const cleanPath = decoded.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
    const path = cleanPath.replace(/^\/api\/admin\/?/i, "");
    const segs = path ? path.split("/").filter(Boolean) : [];

    if (segs.length === 1 && segs[0] === "me" && m === "GET") {
      return jsonResponse({
        ok: true,
        role: "admin",
        user: actor,
      });
    }

    if (segs.length === 1 && segs[0] === "overview" && m === "GET") {
      return this.handleOverview(actor);
    }

    if (segs[0] === "demo") {
      return this.handleDemo(segs.slice(1), m, actor);
    }

    if (segs[0] === "leaderboards") {
      return this.handleLeaderboards(req, segs.slice(1), m, actor);
    }

    if (segs[0] === "raffles") {
      return this.raffles.handleAdminRaffles(req, segs.slice(1), m, actor);
    }

    if (segs[0] === "users") {
      return this.handleUsers(req, segs.slice(1), m, actor);
    }

    if (segs[0] === "site") {
      return this.handleSite(req, segs.slice(1), m, actor);
    }

    if (segs[0] === "audit") {
      return this.handleAudit(req);
    }

    return notFound();
  }

  private async handleDemo(segs: string[], m: string, actor: Actor): Promise<HttpResult> {
    if (segs.length === 0 && m === "GET") {
      const demoBoards = await this.db.all<{
        id: number;
        slug: string;
        title: string;
        prize_pool_cents: number;
        ends_at: number;
        archived: number;
        hidden: number;
      }>(
        `SELECT id, slug, title, prize_pool_cents, ends_at, archived, hidden
         FROM leaderboards
         WHERE is_demo = 1
         ORDER BY sort_order ASC, id ASC`,
      );
      const demoRaffles = await this.db.all<{
        id: number;
        title: string;
        prize: string;
        ends_at: number;
        hidden: number;
      }>(
        `SELECT id, title, prize, ends_at, hidden
         FROM raffles
         WHERE is_demo = 1
         ORDER BY ends_at DESC, id DESC`,
      );
      return jsonResponse({
        demoBoards,
        demoRaffles,
        counts: {
          boards: demoBoards.length,
          raffles: demoRaffles.length,
          total: demoBoards.length + demoRaffles.length,
        },
      });
    }

    if ((segs.length === 0 && m === "DELETE") || (segs.length === 1 && segs[0] === "purge" && m === "POST")) {
      const demoBoardRows = await this.db.all<{ id: number; slug: string }>(
        `SELECT id, slug FROM leaderboards WHERE is_demo = 1`,
      );
      const demoRaffleRows = await this.db.all<{ id: number; title: string }>(
        `SELECT id, title FROM raffles WHERE is_demo = 1`,
      );
      const deletedBoards = demoBoardRows.length;
      const deletedRaffles = demoRaffleRows.length;

      if (deletedBoards > 0 || deletedRaffles > 0) {
        await this.db.batch([
          this.db.stmt(
            `DELETE FROM lb_spot_prizes WHERE board_id IN (SELECT id FROM leaderboards WHERE is_demo = 1)`,
          ),
          this.db.stmt(
            `DELETE FROM lb_players WHERE board_id IN (SELECT id FROM leaderboards WHERE is_demo = 1)`,
          ),
          this.db.stmt(`DELETE FROM leaderboards WHERE is_demo = 1`),
          this.db.stmt(
            `DELETE FROM raffle_winners WHERE raffle_id IN (SELECT id FROM raffles WHERE is_demo = 1)`,
          ),
          this.db.stmt(
            `DELETE FROM raffle_entries WHERE raffle_id IN (SELECT id FROM raffles WHERE is_demo = 1)`,
          ),
          this.db.stmt(`DELETE FROM raffles WHERE is_demo = 1`),
        ]);
      }

      await this.db.run(
        `DELETE FROM kick_accounts
         WHERE kick_user_id LIKE 'demo-bot-%'
           AND NOT EXISTS (SELECT 1 FROM raffle_entries WHERE raffle_entries.kick_user_id = kick_accounts.kick_user_id)
           AND NOT EXISTS (SELECT 1 FROM raffle_winners WHERE raffle_winners.kick_user_id = kick_accounts.kick_user_id)
           AND NOT EXISTS (SELECT 1 FROM site_people WHERE site_people.kick_user_id = kick_accounts.kick_user_id)`,
      );

      await this.audit.audit(actor, "demo.purge", "all", {
        deletedBoards,
        deletedRaffles,
        boardSlugs: demoBoardRows.map((b) => b.slug),
      });

      return jsonResponse({
        ok: true,
        deletedBoards,
        deletedRaffles,
      });
    }

    return notFound();
  }

  private async handleLeaderboards(
    req: Request,
    segs: string[],
    m: string,
    actor: Actor,
  ): Promise<HttpResult> {
    if (segs.length === 0 && m === "GET") {
      const boards = await this.db.all(
        `SELECT l.*,
                (SELECT COUNT(*) FROM lb_players p WHERE p.board_id = l.id) AS player_count,
                (SELECT COALESCE(SUM(p.wagered_cents), 0) FROM lb_players p WHERE p.board_id = l.id) AS total_wagered_cents,
                (SELECT COALESCE(SUM(s.prize_cents), 0) FROM lb_spot_prizes s WHERE s.board_id = l.id) AS spot_prize_total_cents
         FROM leaderboards l
         ORDER BY l.archived ASC, l.sort_order ASC, l.ends_at DESC`,
      );
      return jsonResponse({ boards });
    }

    if (segs.length === 0 && m === "POST") {
      const body = await readBody(req);
      if (!body) return badRequest("Invalid payload");

      const title = asTrimmed(body.title);
      if (!title) return badRequest("Title is required");

      const explicitSlug = body.slug !== undefined && body.slug !== null ? asTrimmed(body.slug) : "";
      let slug = "";
      if (explicitSlug) {
        const candidate = toSlug(explicitSlug);
        if (!isValidSlug(candidate)) {
          return badRequest(
            "Invalid or reserved slug (use 2-40 lowercase letters, numbers, or hyphens)",
          );
        }
        const existing = await this.db.first(`SELECT 1 FROM leaderboards WHERE slug = ?`, candidate);
        if (existing) {
          return jsonResponse({ error: "A leaderboard with this slug already exists" }, 409);
        }
        slug = candidate;
      } else {
        const singleToken = title
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
        const baseSlug =
          toSlug(title) ||
          (singleToken.length === 1 ? `race-${singleToken}` : `board-${Date.now()}`);
        slug = baseSlug;
        let suffix = 2;
        while (await this.db.first(`SELECT 1 FROM leaderboards WHERE slug = ?`, slug)) {
          const prefix = baseSlug.slice(0, 34).replace(/-+$/g, "");
          slug = `${prefix}-${suffix}`;
          suffix += 1;
        }
      }

      const now = Date.now();
      const subtitle = asTrimmed(body.subtitle);
      const startsAt =
        body.starts_at !== undefined && body.starts_at !== null && body.starts_at !== ""
          ? Math.trunc(Number(body.starts_at))
          : now;
      const endsAt =
        body.ends_at !== undefined && body.ends_at !== null && body.ends_at !== ""
          ? Math.trunc(Number(body.ends_at))
          : startsAt + 30 * 24 * 3600 * 1000;
      if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) {
        return badRequest("Invalid start or end date");
      }
      if (endsAt <= startsAt) {
        return badRequest("End date must be after start date");
      }

      const prizePoolCents = Math.max(0, Math.floor(Number(body.prize_pool_cents) || 0));
      const partner = asTrimmed(body.partner) || "stake";
      const partnerUrl = asTrimmed(body.partner_signup_url) || "https://stake.com/?c=KDEENOFF";
      const avatarStyle = asTrimmed(body.avatar_style) || "kdeenoff";
      const badge = asTrimmed(body.badge).slice(0, 24);
      const promoCode = asTrimmed(body.promo_code).slice(0, 40);
      const sortOrder = body.sort_order !== undefined ? (asInt(body.sort_order) ?? 0) : 0;
      const showInDrawer =
        body.show_in_drawer !== undefined ? (asBool(body.show_in_drawer) ? 1 : 0) : 1;
      const showOnHome =
        body.show_on_home !== undefined ? (asBool(body.show_on_home) ? 1 : 0) : 1;
      const hidden = body.hidden !== undefined ? (asBool(body.hidden) ? 1 : 0) : 0;
      const isDemo = body.is_demo !== undefined ? (asBool(body.is_demo) ? 1 : 0) : 0;
      const autoRank =
        body.auto_rank_by_wagered !== undefined ? (asBool(body.auto_rank_by_wagered) ? 1 : 0) : 1;
      const growthEnabled =
        body.auto_wager_growth_enabled !== undefined
          ? asBool(body.auto_wager_growth_enabled)
            ? 1
            : 0
          : 0;
      const growthPct =
        body.auto_wager_growth_pct !== undefined
          ? clampWagerGrowthPct(Number(body.auto_wager_growth_pct))
          : 3;
      const growthInterval =
        body.auto_wager_growth_interval_ms !== undefined
          ? clampWagerGrowthIntervalMs(Number(body.auto_wager_growth_interval_ms))
          : 43200000;
      const autoHidden =
        body.auto_hidden_above_rank !== undefined
          ? Math.max(0, asInt(body.auto_hidden_above_rank) ?? 0)
          : 25;

      const initialSpots = new Map<number, { prizeCents: number; hidden: number }>();
      if (Array.isArray(body.spots)) {
        for (const item of body.spots) {
          if (!item || typeof item !== "object") continue;
          const rank = asInt(item.rank);
          if (!rank || rank < 1 || rank > 200) continue;
          const prizeCents = Math.max(0, Math.floor(Number(item.prize_cents) || 0));
          const spotHidden = asBool(item.hidden) ? 1 : 0;
          if (prizeCents > 0 || spotHidden === 1) {
            initialSpots.set(rank, { prizeCents, hidden: spotHidden });
          }
        }
      }

      try {
        const stmts: BoundStatement[] = [
          this.db.stmt(
            `INSERT INTO leaderboards (
              slug, title, subtitle, starts_at, ends_at, prize_pool_cents,
              hidden, archived, partner_signup_url, partner, avatar_style,
              auto_rank_by_wagered, auto_wager_growth_enabled, auto_wager_growth_pct,
              auto_wager_growth_interval_ms, auto_hidden_above_rank,
              badge, promo_code, sort_order, show_in_drawer, show_on_home, is_demo,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            slug,
            title,
            subtitle,
            startsAt,
            endsAt,
            prizePoolCents,
            hidden,
            partnerUrl,
            partner,
            avatarStyle,
            autoRank,
            growthEnabled,
            growthPct,
            growthInterval,
            autoHidden,
            badge,
            promoCode,
            sortOrder,
            showInDrawer,
            showOnHome,
            isDemo,
            now,
            now,
          ),
        ];
        for (const [rank, sp] of [...initialSpots.entries()].sort((a, b) => a[0] - b[0])) {
          stmts.push(
            this.db.stmt(
              `INSERT INTO lb_spot_prizes (board_id, rank, prize_cents, hidden)
               VALUES ((SELECT id FROM leaderboards WHERE slug = ?), ?, ?, ?)`,
              slug,
              rank,
              sp.prizeCents,
              sp.hidden,
            ),
          );
        }

        const results = await this.db.batch(stmts);
        const newId = results[0]?.lastRowId ?? 0;
        await this.audit.audit(actor, "lb.create", slug, {
          title,
          id: newId,
          spots: initialSpots.size,
        });
        return jsonResponse({ ok: true, slug, id: newId });
      } catch (e) {
        return badRequest(`Failed to create leaderboard: ${(e as Error).message}`);
      }
    }

    const slug = segs[0];
    const board = await this.db.first(`SELECT * FROM leaderboards WHERE slug = ?`, slug);
    if (!board) return notFound("Leaderboard not found");
    const boardId = Number(board.id);

    if (segs.length === 1 && m === "GET") {
      const rawPlayers = await this.db.all(
        `SELECT * FROM lb_players WHERE board_id = ? ORDER BY sort_order ASC, wagered_cents DESC, id ASC`,
        boardId,
      );
      const registeredNames = await loadAuthorizedKickNames(
        this.db,
        rawPlayers.map((p) => String(p.username || "")),
      );
      const players = rawPlayers.map((p) => ({
        ...p,
        is_registered: registeredNames.has(normalizeKickHandle(p.username)) ? 1 : 0,
      }));
      const spots = await loadSpotPrizes(this.db, boardId);

      return jsonResponse({
        board,
        players,
        spots,
      });
    }

    if (segs.length === 1 && m === "PATCH") {
      const body = await readBody(req);
      if (!body) return badRequest("Invalid payload");

      let updatedSlug = slug;
      if (body.new_slug !== undefined && body.new_slug !== null && asTrimmed(body.new_slug) !== "") {
        const candidate = toSlug(body.new_slug);
        if (!isValidSlug(candidate)) {
          return badRequest(
            "Invalid or reserved slug (use 2-40 lowercase letters, numbers, or hyphens)",
          );
        }
        if (candidate !== slug) {
          const existing = await this.db.first(
            `SELECT 1 FROM leaderboards WHERE slug = ? AND id != ?`,
            candidate,
            boardId,
          );
          if (existing) {
            return jsonResponse({ error: "A leaderboard with this slug already exists" }, 409);
          }
          updatedSlug = candidate;
        }
      }

      const title =
        body.title !== undefined && body.title !== null ? asTrimmed(body.title) : board.title;
      if (!title) return badRequest("Title is required");

      const subtitle =
        body.subtitle !== undefined && body.subtitle !== null
          ? asTrimmed(body.subtitle)
          : board.subtitle;
      const startsAt =
        body.starts_at !== undefined && body.starts_at !== null
          ? Math.trunc(Number(body.starts_at))
          : Number(board.starts_at);
      const endsAt =
        body.ends_at !== undefined && body.ends_at !== null
          ? Math.trunc(Number(body.ends_at))
          : Number(board.ends_at);
      if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) {
        return badRequest("Invalid start or end date");
      }
      if (endsAt <= startsAt) {
        return badRequest("End date must be after start date");
      }

      const prizePoolCents =
        body.prize_pool_cents !== undefined && body.prize_pool_cents !== null
          ? Math.max(0, Math.floor(Number(body.prize_pool_cents) || 0))
          : board.prize_pool_cents;
      const partner =
        body.partner !== undefined && body.partner !== null ? asTrimmed(body.partner) : board.partner;
      const partnerUrl =
        body.partner_signup_url !== undefined && body.partner_signup_url !== null
          ? asTrimmed(body.partner_signup_url)
          : board.partner_signup_url;
      const avatarStyle =
        body.avatar_style !== undefined && body.avatar_style !== null
          ? asTrimmed(body.avatar_style)
          : board.avatar_style;
      const autoRank =
        body.auto_rank_by_wagered !== undefined && body.auto_rank_by_wagered !== null
          ? asBool(body.auto_rank_by_wagered)
            ? 1
            : 0
          : board.auto_rank_by_wagered;
      const growthEnabled =
        body.auto_wager_growth_enabled !== undefined && body.auto_wager_growth_enabled !== null
          ? asBool(body.auto_wager_growth_enabled)
            ? 1
            : 0
          : board.auto_wager_growth_enabled;
      const growthPct =
        body.auto_wager_growth_pct !== undefined && body.auto_wager_growth_pct !== null
          ? clampWagerGrowthPct(Number(body.auto_wager_growth_pct))
          : board.auto_wager_growth_pct;
      const growthInterval =
        body.auto_wager_growth_interval_ms !== undefined &&
          body.auto_wager_growth_interval_ms !== null
          ? clampWagerGrowthIntervalMs(Number(body.auto_wager_growth_interval_ms))
          : board.auto_wager_growth_interval_ms;
      const autoHidden =
        body.auto_hidden_above_rank !== undefined && body.auto_hidden_above_rank !== null
          ? Math.max(0, asInt(body.auto_hidden_above_rank) || 0)
          : board.auto_hidden_above_rank;
      const hidden =
        body.hidden !== undefined && body.hidden !== null
          ? asBool(body.hidden)
            ? 1
            : 0
          : board.hidden;
      const badge =
        body.badge !== undefined && body.badge !== null
          ? asTrimmed(body.badge).slice(0, 24)
          : String(board.badge ?? "");
      const promoCode =
        body.promo_code !== undefined && body.promo_code !== null
          ? asTrimmed(body.promo_code).slice(0, 40)
          : String(board.promo_code ?? "");
      const sortOrder =
        body.sort_order !== undefined && body.sort_order !== null
          ? (asInt(body.sort_order) ?? 0)
          : Number(board.sort_order) || 0;
      const showInDrawer =
        body.show_in_drawer !== undefined && body.show_in_drawer !== null
          ? asBool(body.show_in_drawer)
            ? 1
            : 0
          : board.show_in_drawer ?? 1;
      const showOnHome =
        body.show_on_home !== undefined && body.show_on_home !== null
          ? asBool(body.show_on_home)
            ? 1
            : 0
          : board.show_on_home ?? 1;
      const isDemo =
        body.is_demo !== undefined && body.is_demo !== null
          ? asBool(body.is_demo)
            ? 1
            : 0
          : board.is_demo ?? 0;
      const now = Date.now();

      await this.db.run(
        `UPDATE leaderboards SET
          slug = ?, title = ?, subtitle = ?, starts_at = ?, ends_at = ?, prize_pool_cents = ?,
          partner = ?, partner_signup_url = ?, avatar_style = ?, auto_rank_by_wagered = ?,
          auto_wager_growth_enabled = ?, auto_wager_growth_pct = ?,
          auto_wager_growth_interval_ms = ?, auto_hidden_above_rank = ?, hidden = ?,
          badge = ?, promo_code = ?, sort_order = ?, show_in_drawer = ?, show_on_home = ?,
          is_demo = ?, updated_at = ?
         WHERE id = ?`,
        updatedSlug,
        title,
        subtitle,
        startsAt,
        endsAt,
        prizePoolCents,
        partner,
        partnerUrl,
        avatarStyle,
        autoRank,
        growthEnabled,
        growthPct,
        growthInterval,
        autoHidden,
        hidden,
        badge,
        promoCode,
        sortOrder,
        showInDrawer,
        showOnHome,
        isDemo,
        now,
        boardId,
      );

      await this.audit.audit(actor, "lb.update", updatedSlug, {
        title,
        prizePoolCents,
        ...(updatedSlug !== slug ? { previousSlug: slug } : {}),
      });
      return jsonResponse({ ok: true, slug: updatedSlug });
    }

    if (segs.length === 1 && m === "DELETE") {
      await this.db.batch([
        this.db.stmt(`DELETE FROM lb_spot_prizes WHERE board_id = ?`, boardId),
        this.db.stmt(`DELETE FROM lb_players WHERE board_id = ?`, boardId),
        this.db.stmt(`DELETE FROM leaderboards WHERE id = ?`, boardId),
      ]);
      await this.audit.audit(actor, "lb.delete", slug, { title: board.title });
      return jsonResponse({ ok: true });
    }

    if (segs.length === 2 && segs[1] === "duplicate" && m === "POST") {
      const body = (await readBody(req)) || {};
      const baseSlug = toSlug(body.slug || `${slug}-copy`) || `board-${Date.now()}`;
      let nextSlug = baseSlug;
      let suffix = 2;
      while (await this.db.first(`SELECT 1 FROM leaderboards WHERE slug = ?`, nextSlug)) {
        const prefix = baseSlug.slice(0, 34).replace(/-+$/g, "");
        nextSlug = `${prefix}-${suffix}`;
        suffix += 1;
      }
      const nextTitle = asTrimmed(body.title) || `${String(board.title || slug)} (Copy)`;
      const dupHidden = body.hidden !== undefined ? (asBool(body.hidden) ? 1 : 0) : 1;
      const now = Date.now();
      const duration = Math.max(
        24 * 3600 * 1000,
        (Number(board.ends_at) || now + 30 * 86400 * 1000) - (Number(board.starts_at) || now),
      );
      const spots = await loadSpotPrizes(this.db, boardId);

      const dupStmts: BoundStatement[] = [
        this.db.stmt(
          `INSERT INTO leaderboards (
            slug, title, subtitle, starts_at, ends_at, prize_pool_cents,
            hidden, archived, partner_signup_url, partner, avatar_style,
            auto_rank_by_wagered, auto_wager_growth_enabled, auto_wager_growth_pct,
            auto_wager_growth_interval_ms, auto_hidden_above_rank,
            badge, promo_code, sort_order, show_in_drawer, show_on_home, is_demo,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          nextSlug,
          nextTitle,
          board.subtitle ?? null,
          now,
          now + duration,
          Number(board.prize_pool_cents) || 0,
          dupHidden,
          board.partner_signup_url ?? null,
          board.partner ?? "stake",
          board.avatar_style || "kdeenoff",
          Number(board.auto_rank_by_wagered) ? 1 : 0,
          Number(board.auto_wager_growth_enabled) ? 1 : 0,
          Number(board.auto_wager_growth_pct) || 3,
          Number(board.auto_wager_growth_interval_ms) || 43200000,
          Number(board.auto_hidden_above_rank) || 0,
          String(board.badge || "").slice(0, 24),
          String(board.promo_code || "").slice(0, 40),
          Number(board.sort_order) || 0,
          board.show_in_drawer !== undefined ? (Number(board.show_in_drawer) ? 1 : 0) : 1,
          board.show_on_home !== undefined ? (Number(board.show_on_home) ? 1 : 0) : 1,
          now,
          now,
        ),
      ];
      for (const s of spots) {
        dupStmts.push(
          this.db.stmt(
            `INSERT INTO lb_spot_prizes (board_id, rank, prize_cents, hidden)
             VALUES ((SELECT id FROM leaderboards WHERE slug = ?), ?, ?, ?)`,
            nextSlug,
            Number(s.rank),
            Number(s.prize_cents) || 0,
            Number(s.hidden) ? 1 : 0,
          ),
        );
      }

      const dupResults = await this.db.batch(dupStmts);
      const newBoardId = dupResults[0]?.lastRowId ?? 0;
      await this.audit.audit(actor, "lb.duplicate", nextSlug, { from: slug, id: newBoardId });
      return jsonResponse({ ok: true, slug: nextSlug, id: newBoardId });
    }

    if (segs.length === 2 && segs[1] === "archive" && m === "POST") {
      await this.db.run(
        `UPDATE leaderboards SET archived = 1, updated_at = ? WHERE id = ?`,
        Date.now(),
        boardId,
      );
      await this.audit.audit(actor, "lb.archive", slug, {});
      return jsonResponse({ ok: true });
    }

    if (segs.length === 2 && segs[1] === "unarchive" && m === "POST") {
      await this.db.run(
        `UPDATE leaderboards SET archived = 0, updated_at = ? WHERE id = ?`,
        Date.now(),
        boardId,
      );
      await this.audit.audit(actor, "lb.unarchive", slug, {});
      return jsonResponse({ ok: true });
    }

    if (segs[1] === "players") {
      if (segs.length === 2 && m === "POST") {
        const body = await readBody(req);
        if (!body) return badRequest("Invalid payload");
        const username = asTrimmed(body.username);
        if (!username) return badRequest("Username is required");

        const wagered = Math.max(0, Math.floor(Number(body.wagered_cents) || 0));
        const prize = Math.max(0, Math.floor(Number(body.prize_cents) || 0));
        const avatarUrl = asTrimmed(body.avatar_url) || null;
        const avatarSid = asTrimmed(body.avatar_sid) || username.toLowerCase();
        const wagGrowth = asBool(body.wag_growth_enabled) ? 1 : 0;
        const wagPct = body.wag_growth_pct ? clampWagerGrowthPct(body.wag_growth_pct) : null;
        const wagHours = body.wag_growth_hours ? Number(body.wag_growth_hours) : null;

        const countRs = await this.db.first<{ c: number }>(
          `SELECT COUNT(*) as c FROM lb_players WHERE board_id = ?`,
          boardId,
        );
        const nextRank = (Number(countRs?.c) || 0) + 1;

        const ins = await this.db.run(
          `INSERT INTO lb_players (
            board_id, rank, sort_order, username, wagered_cents, prize_cents,
            avatar_url, avatar_sid, wag_growth_enabled, wag_growth_pct, wag_growth_hours,
            wag_growth_last_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          boardId,
          nextRank,
          nextRank,
          username,
          wagered,
          prize,
          avatarUrl,
          avatarSid,
          wagGrowth,
          wagPct,
          wagHours,
          Date.now(),
        );

        if (board.auto_rank_by_wagered) {
          await rankPlayersByWagered(this.db, boardId);
        }

        await this.audit.audit(actor, "player.add", `${slug}:${username}`, { wagered, prize });
        return jsonResponse({ ok: true, id: ins.lastRowId });
      }

      if (segs.length === 3 && segs[2] === "reorder" && m === "POST") {
        const body = await readBody(req);
        const order = Array.isArray(body?.order) ? body.order : null;
        if (!order || !order.length) return badRequest("Player ID order array is required");

        const existing = await this.db.all<{ id: number }>(
          `SELECT id FROM lb_players WHERE board_id = ? ORDER BY sort_order ASC, wagered_cents DESC, id ASC`,
          boardId,
        );
        const validIds = new Set(existing.map((r) => Number(r.id)));
        const seen = new Set<number>();
        const finalOrder: number[] = [];

        for (const rawId of order) {
          const pid = Number(rawId);
          if (Number.isInteger(pid) && validIds.has(pid) && !seen.has(pid)) {
            seen.add(pid);
            finalOrder.push(pid);
          }
        }
        for (const row of existing) {
          const pid = Number(row.id);
          if (!seen.has(pid)) finalOrder.push(pid);
        }

        const stmts: BoundStatement[] = finalOrder.map((pid, idx) =>
          this.db.stmt(
            `UPDATE lb_players SET rank = ?, sort_order = ? WHERE board_id = ? AND id = ?`,
            idx + 1,
            idx + 1,
            boardId,
            pid,
          ),
        );
        if (asBool(body?.disable_auto_rank) === true) {
          stmts.push(
            this.db.stmt(
              `UPDATE leaderboards SET auto_rank_by_wagered = 0, updated_at = ? WHERE id = ?`,
              Date.now(),
              boardId,
            ),
          );
        }
        if (stmts.length) await this.db.batch(stmts);
        await this.audit.audit(actor, "players.reorder", slug, { count: finalOrder.length });
        return jsonResponse({ ok: true, count: finalOrder.length });
      }

      if (segs.length === 3 && segs[2] === "auto-rank" && m === "POST") {
        const count = await rankPlayersByWagered(this.db, boardId);
        await this.audit.audit(actor, "players.auto_rank", slug, { count });
        return jsonResponse({ ok: true, count });
      }

      if (segs.length === 3 && segs[2] === "apply-wager-growth" && m === "POST") {
        const { players, tickCount } = await this.wagerGrowth.applyWagerGrowthForBoard(board);
        if (board.auto_rank_by_wagered) {
          await rankPlayersByWagered(this.db, boardId);
        }
        await this.audit.audit(actor, "players.wager_growth", slug, {
          tickCount,
          players: players.length,
        });
        return jsonResponse({ ok: true, tickCount, players });
      }

      if (segs.length === 3 && segs[2] === "import-csv" && m === "POST") {
        const body = await readBody(req);
        const csvText = asString(body?.csv || body?.text);
        if (!csvText) return badRequest("CSV text is required");

        const rows = parseCsv(csvText);
        if (!rows.length) return badRequest("Empty CSV");

        const mode = asTrimmed(body?.mode).toLowerCase() === "replace" ? "replace" : "merge";
        const inCents = asBool(body?.in_cents) === true;

        const parsedByLower = new Map<
          string,
          { username: string; wagered: number; prize: number; hasPrize: boolean }
        >();
        for (const row of rows) {
          const username = asTrimmed(row[0]);
          const lower = username.toLowerCase();
          if (
            !username ||
            lower === "username" ||
            lower === "player" ||
            lower === "name" ||
            lower === "user"
          ) {
            continue;
          }
          const wagered = parseCsvMoneyCents(row[1], inCents);
          const rawPrize = row[2] !== undefined ? asTrimmed(row[2]) : "";
          const hasPrize = rawPrize !== "";
          const prize = hasPrize ? parseCsvMoneyCents(rawPrize, inCents) : 0;
          parsedByLower.set(lower, { username, wagered, prize, hasPrize });
        }

        const parsedList = [...parsedByLower.values()];
        if (!parsedList.length) return badRequest("No valid player rows found in CSV");

        const now = Date.now();
        const stmts: BoundStatement[] = [];
        let created = 0;
        let updated = 0;

        if (mode === "replace") {
          stmts.push(this.db.stmt(`DELETE FROM lb_players WHERE board_id = ?`, boardId));
          for (let i = 0; i < parsedList.length; i++) {
            const entry = parsedList[i];
            const ord = i + 1;
            created++;
            stmts.push(
              this.db.stmt(
                `INSERT INTO lb_players (board_id, rank, sort_order, username, wagered_cents, prize_cents, avatar_sid, wag_growth_last_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                boardId,
                ord,
                ord,
                entry.username,
                entry.wagered,
                entry.prize,
                entry.username.toLowerCase(),
                now,
              ),
            );
          }
        } else {
          const existingRows = await this.db.all<{ id: number; username: string; prize_cents: number }>(
            `SELECT id, username, prize_cents FROM lb_players WHERE board_id = ? ORDER BY id ASC`,
            boardId,
          );
          const existingByLower = new Map<string, { id: number; prize_cents: number }>();
          for (const ex of existingRows) {
            const k = String(ex.username || "").trim().toLowerCase();
            if (k && !existingByLower.has(k)) {
              existingByLower.set(k, {
                id: Number(ex.id),
                prize_cents: Number(ex.prize_cents) || 0,
              });
            }
          }

          let nextOrder = existingRows.length;
          for (const entry of parsedList) {
            const match = existingByLower.get(entry.username.toLowerCase());
            if (match) {
              updated++;
              stmts.push(
                this.db.stmt(
                  `UPDATE lb_players
                   SET username = ?, wagered_cents = ?, prize_cents = ?
                   WHERE board_id = ? AND id = ?`,
                  entry.username,
                  entry.wagered,
                  entry.hasPrize ? entry.prize : match.prize_cents,
                  boardId,
                  match.id,
                ),
              );
            } else {
              nextOrder++;
              created++;
              stmts.push(
                this.db.stmt(
                  `INSERT INTO lb_players (board_id, rank, sort_order, username, wagered_cents, prize_cents, avatar_sid, wag_growth_last_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                  boardId,
                  nextOrder,
                  nextOrder,
                  entry.username,
                  entry.wagered,
                  entry.prize,
                  entry.username.toLowerCase(),
                  now,
                ),
              );
            }
          }
        }

        const imported = created + updated;
        if (stmts.length) {
          await this.db.batch(stmts);
          if (board.auto_rank_by_wagered) {
            await rankPlayersByWagered(this.db, boardId);
          }
        }

        await this.audit.audit(actor, "players.import_csv", slug, {
          count: imported,
          created,
          updated,
          mode,
        });
        return jsonResponse({ ok: true, imported, updated, created, mode });
      }

      const playerId = asInt(segs[2]);
      if (!playerId) return notFound();

      if (segs.length === 3 && m === "PATCH") {
        const body = await readBody(req);
        if (!body) return badRequest("Invalid payload");

        const player = await this.db.first(
          `SELECT * FROM lb_players WHERE board_id = ? AND id = ?`,
          boardId,
          playerId,
        );
        if (!player) return notFound("Player not found");

        const username = body.username !== undefined ? asTrimmed(body.username) : player.username;
        const wagered =
          body.wagered_cents !== undefined
            ? Math.max(0, Math.floor(Number(body.wagered_cents) || 0))
            : player.wagered_cents;
        const prize =
          body.prize_cents !== undefined
            ? Math.max(0, Math.floor(Number(body.prize_cents) || 0))
            : player.prize_cents;
        const avatarUrl =
          body.avatar_url !== undefined ? asTrimmed(body.avatar_url) || null : player.avatar_url;
        const wagGrowth =
          body.wag_growth_enabled !== undefined
            ? asBool(body.wag_growth_enabled)
              ? 1
              : 0
            : player.wag_growth_enabled;
        const wagPct =
          body.wag_growth_pct !== undefined
            ? clampWagerGrowthPct(body.wag_growth_pct)
            : player.wag_growth_pct;
        const wagHours =
          body.wag_growth_hours !== undefined
            ? Number(body.wag_growth_hours)
            : player.wag_growth_hours;

        await this.db.run(
          `UPDATE lb_players SET
            username = ?, wagered_cents = ?, prize_cents = ?, avatar_url = ?,
            wag_growth_enabled = ?, wag_growth_pct = ?, wag_growth_hours = ?
           WHERE board_id = ? AND id = ?`,
          username,
          wagered,
          prize,
          avatarUrl,
          wagGrowth,
          wagPct,
          wagHours,
          boardId,
          playerId,
        );

        if (board.auto_rank_by_wagered) {
          await rankPlayersByWagered(this.db, boardId);
        }

        await this.audit.audit(actor, "player.update", `${slug}:${playerId}`, {
          username,
          wagered,
          prize,
        });
        return jsonResponse({ ok: true });
      }

      if (segs.length === 3 && m === "DELETE") {
        await this.db.run(`DELETE FROM lb_players WHERE board_id = ? AND id = ?`, boardId, playerId);
        if (board.auto_rank_by_wagered) {
          await rankPlayersByWagered(this.db, boardId);
        }
        await this.audit.audit(actor, "player.delete", `${slug}:${playerId}`, {});
        return jsonResponse({ ok: true });
      }
    }

    if (segs[1] === "spots" && segs.length === 2 && m === "PUT") {
      const body = await readBody(req);
      const list = Array.isArray(body?.spots) ? body.spots : null;
      if (!list) return badRequest("Spots array is required");

      const byRank = new Map<number, { prizeCents: number; hidden: number }>();
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const rank = asInt(item.rank);
        if (!rank || rank < 1 || rank > 200) continue;
        const prizeCents = Math.max(0, Math.floor(Number(item.prize_cents) || 0));
        const hidden = asBool(item.hidden) ? 1 : 0;
        if (prizeCents > 0 || hidden === 1) {
          byRank.set(rank, { prizeCents, hidden });
        }
      }

      const stmts: BoundStatement[] = [
        this.db.stmt(`DELETE FROM lb_spot_prizes WHERE board_id = ?`, boardId),
      ];
      for (const [rank, sp] of [...byRank.entries()].sort((a, b) => a[0] - b[0])) {
        stmts.push(
          this.db.stmt(
            `INSERT INTO lb_spot_prizes (board_id, rank, prize_cents, hidden) VALUES (?, ?, ?, ?)`,
            boardId,
            rank,
            sp.prizeCents,
            sp.hidden,
          ),
        );
      }

      await this.db.batch(stmts);
      await this.audit.audit(actor, "spots.replace", slug, { count: byRank.size });
      return jsonResponse({ ok: true, count: byRank.size });
    }

    if (segs[1] === "spots" && segs.length === 3 && segs[2] === "batch" && m === "POST") {
      const body = await readBody(req);
      const list = Array.isArray(body?.spots) ? body.spots : null;
      if (!list || !list.length) return badRequest("Spots list is required");

      const stmts: BoundStatement[] = [];
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const rank = asInt(item.rank);
        if (!rank || rank < 1 || rank > 200) continue;
        const prizeCents = Math.max(0, Math.floor(Number(item.prize_cents) || 0));
        const hidden = asBool(item.hidden) ? 1 : 0;
        stmts.push(
          this.db.stmt(
            `INSERT INTO lb_spot_prizes (board_id, rank, prize_cents, hidden)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(board_id, rank) DO UPDATE SET
               prize_cents = excluded.prize_cents,
               hidden = excluded.hidden`,
            boardId,
            rank,
            prizeCents,
            hidden,
          ),
        );
      }
      if (!stmts.length) return badRequest("No valid spots");
      await this.db.batch(stmts);
      await this.audit.audit(actor, "spots.batch_update", slug, { count: stmts.length });
      return jsonResponse({ ok: true, count: stmts.length });
    }

    if (segs[1] === "spots" && segs.length === 3 && m === "PATCH") {
      const rank = asInt(segs[2]);
      if (!rank || rank < 1) return badRequest("Invalid spot rank");
      const body = await readBody(req);
      if (!body) return badRequest("Invalid payload");

      if (body.prize_cents !== undefined) {
        await upsertSpotPrize(this.db, boardId, rank, body.prize_cents);
      }
      if (body.hidden !== undefined) {
        await upsertSpotHidden(this.db, boardId, rank, asBool(body.hidden));
      }

      await this.audit.audit(actor, "spot.update", `${slug}:rank-${rank}`, body);
      return jsonResponse({ ok: true });
    }

    return notFound();
  }

  private async handleOverview(actor: Actor): Promise<HttpResult> {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const boards = await this.db.all<{
      id: number;
      slug: string;
      title: string;
      partner: string | null;
      prize_pool_cents: number;
      starts_at: number;
      ends_at: number;
      archived: number;
      hidden: number;
      auto_wager_growth_enabled: number;
      avatar_style: string | null;
      badge: string;
      promo_code: string;
      sort_order: number;
      show_in_drawer: number;
      show_on_home: number;
      is_demo: number;
      player_count: number;
      total_wagered_cents: number;
    }>(
      `SELECT l.id, l.slug, l.title, l.partner, l.prize_pool_cents, l.starts_at, l.ends_at,
              l.archived, l.hidden, l.auto_wager_growth_enabled, l.avatar_style,
              l.badge, l.promo_code, l.sort_order, l.show_in_drawer, l.show_on_home, l.is_demo,
              (SELECT COUNT(*) FROM lb_players p WHERE p.board_id = l.id) AS player_count,
              (SELECT COALESCE(SUM(p.wagered_cents), 0) FROM lb_players p WHERE p.board_id = l.id) AS total_wagered_cents
       FROM leaderboards l
       ORDER BY l.archived ASC, l.sort_order ASC, l.ends_at DESC`,
    );

    let activeBoards = 0;
    let endedBoards = 0;
    let archivedBoards = 0;
    let hiddenBoards = 0;
    let demoBoards = 0;
    let activePrizePoolCents = 0;
    let totalWageredActiveCents = 0;
    let totalWageredAllCents = 0;
    let totalPlayers = 0;
    let activePlayers = 0;

    for (const b of boards) {
      const players = Number(b.player_count) || 0;
      const wagered = Number(b.total_wagered_cents) || 0;
      totalPlayers += players;
      totalWageredAllCents += wagered;
      if (b.hidden) hiddenBoards += 1;
      if (b.is_demo) demoBoards += 1;
      if (b.archived) {
        archivedBoards += 1;
      } else if (Number(b.ends_at) <= now) {
        endedBoards += 1;
      } else {
        activeBoards += 1;
        activePlayers += players;
        activePrizePoolCents += Number(b.prize_pool_cents) || 0;
        totalWageredActiveCents += wagered;
      }
    }

    const growthRow = await this.db.first<{ c: number }>(
      `SELECT COUNT(*) AS c FROM lb_players p
       JOIN leaderboards l ON l.id = p.board_id
       WHERE l.archived = 0 AND p.wag_growth_enabled = 1`,
    );

    const raffleRows = await this.db.all<{
      id: number;
      starts_at: number;
      ends_at: number;
      hidden: number;
      winner: string | null;
      is_demo: number;
      entry_count: number;
    }>(
      `SELECT r.id, r.starts_at, r.ends_at, r.hidden, r.winner, r.is_demo,
              (SELECT COUNT(*) FROM raffle_entries e WHERE e.raffle_id = r.id) AS entry_count
       FROM raffles r`,
    );

    let liveRaffles = 0;
    let upcomingRaffles = 0;
    let finishedRaffles = 0;
    let awaitingWinnerRaffles = 0;
    let totalRaffleEntries = 0;
    let demoRaffles = 0;

    for (const r of raffleRows) {
      totalRaffleEntries += Number(r.entry_count) || 0;
      if (r.is_demo) demoRaffles += 1;
      if (r.hidden) continue;
      if (Number(r.ends_at) <= now) {
        finishedRaffles += 1;
        if (!r.winner && (Number(r.entry_count) || 0) > 0) awaitingWinnerRaffles += 1;
      } else if (Number(r.starts_at) > now) {
        upcomingRaffles += 1;
      } else {
        liveRaffles += 1;
      }
    }

    const peopleCounts = await this.db.first<{
      total: number;
      verified: number;
      linked: number;
    }>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN email_verified_at IS NOT NULL THEN 1 ELSE 0 END) AS verified,
              SUM(CASE WHEN kick_user_id IS NOT NULL AND kick_user_id != '' THEN 1 ELSE 0 END) AS linked
       FROM site_people`,
    );

    const orphanKickRow = await this.db.first<{ c: number }>(
      `SELECT COUNT(*) AS c FROM kick_accounts ka
       WHERE NOT EXISTS (SELECT 1 FROM site_people sp WHERE sp.kick_user_id = ka.kick_user_id)`,
    );

    const activeSessionsRow = await this.db.first<{ c: number }>(
      `SELECT COUNT(*) AS c FROM site_sessions WHERE expires_at > ?`,
      now,
    );

    const auditCounts = await this.db.first<{ total: number; day: number }>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN at > ? THEN 1 ELSE 0 END) AS day
       FROM audit_log`,
      now - dayMs,
    );

    const rawTopPlayers = await this.db.all<{
      id: number;
      username: string;
      rank: number | null;
      wagered_cents: number;
      prize_cents: number;
      avatar_url: string | null;
      avatar_sid: string | null;
      wag_growth_enabled: number;
      board_slug: string;
      board_title: string;
      avatar_style: string | null;
    }>(
      `SELECT p.id, p.username, p.rank, p.wagered_cents, p.prize_cents,
              p.avatar_url, p.avatar_sid, p.wag_growth_enabled,
              l.slug AS board_slug, l.title AS board_title, l.avatar_style
       FROM lb_players p
       JOIN leaderboards l ON l.id = p.board_id
       WHERE l.archived = 0
       ORDER BY p.wagered_cents DESC, p.id ASC
       LIMIT 8`,
    );

    const topRegisteredNames = await loadAuthorizedKickNames(
      this.db,
      rawTopPlayers.map((p) => String(p.username || "")),
    );

    const topPlayers = rawTopPlayers.map((p) => {
      const style = String(p.avatar_style || "kdeenoff").trim().toLowerCase();
      const custom = p.avatar_url && !p.avatar_url.includes("dicebear.com") ? p.avatar_url : "";
      const isRegistered = topRegisteredNames.has(normalizeKickHandle(p.username));
      const avatar =
        style === "none"
          ? ""
          : custom ||
          (isRegistered
            ? buildLeaderboardAvatarUrl(p.username || p.avatar_sid || p.id, style)
            : buildNeutralAvatarUrl(style));
      return {
        id: p.id,
        username: p.username,
        rank: p.rank,
        wagered_cents: p.wagered_cents,
        prize_cents: p.prize_cents,
        avatar_url: avatar,
        wag_growth_enabled: Boolean(p.wag_growth_enabled),
        board_slug: p.board_slug,
        board_title: p.board_title,
      };
    });

    // 14-day daily activity buckets (UTC midnight boundaries)
    const todayStart = Math.floor(now / dayMs) * dayMs;
    const windowStart = todayStart - 13 * dayMs;

    const entryTimes = await this.db.all<{ t: number }>(
      `SELECT created_at AS t FROM raffle_entries WHERE created_at >= ?`,
      windowStart,
    );
    const userTimes = await this.db.all<{ t: number }>(
      `SELECT created_at AS t FROM site_people WHERE created_at >= ?`,
      windowStart,
    );
    const auditTimes = await this.db.all<{ t: number }>(
      `SELECT at AS t FROM audit_log WHERE at >= ?`,
      windowStart,
    );

    const buckets = new Map<number, { entries: number; users: number; audits: number }>();
    for (let i = 0; i < 14; i++) {
      buckets.set(windowStart + i * dayMs, { entries: 0, users: 0, audits: 0 });
    }
    const bump = (ts: number, field: "entries" | "users" | "audits") => {
      const key = Math.floor(Number(ts) / dayMs) * dayMs;
      const b = buckets.get(key);
      if (b) b[field] += 1;
    };
    for (const r of entryTimes) bump(r.t, "entries");
    for (const r of userTimes) bump(r.t, "users");
    for (const r of auditTimes) bump(r.t, "audits");

    const activitySeries = Array.from(buckets.entries()).map(([ts, counts]) => {
      const d = new Date(ts);
      const iso = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
      return {
        date: iso,
        label,
        entries: counts.entries,
        users: counts.users,
        audits: counts.audits,
      };
    });

    const recentAudit = await this.db.all(`SELECT * FROM audit_log ORDER BY at DESC LIMIT 12`);

    return jsonResponse({
      actor,
      kpis: {
        activeBoards,
        totalBoards: boards.length,
        endedBoards,
        archivedBoards,
        hiddenBoards,
        demoBoards,
        totalPlayers,
        activePlayers,
        growthEnabledPlayers: Number(growthRow?.c) || 0,
        activePrizePoolCents,
        totalWageredActiveCents,
        totalWageredAllCents,
        liveRaffles,
        upcomingRaffles,
        finishedRaffles,
        awaitingWinnerRaffles,
        totalRaffleEntries,
        demoRaffles,
        totalUsers: (Number(peopleCounts?.total) || 0) + (Number(orphanKickRow?.c) || 0),
        verifiedEmails: Number(peopleCounts?.verified) || 0,
        linkedKickUsers: (Number(peopleCounts?.linked) || 0) + (Number(orphanKickRow?.c) || 0),
        activeSessions: Number(activeSessionsRow?.c) || 0,
        auditLast24h: Number(auditCounts?.day) || 0,
        auditTotal: Number(auditCounts?.total) || 0,
      },
      boardBreakdown: boards,
      topPlayers,
      activitySeries,
      recentAudit,
    });
  }

  private async handleUsers(
    req: Request,
    segs: string[],
    m: string,
    actor: Actor,
  ): Promise<HttpResult> {
    const now = Date.now();

    if (segs.length === 0 && m === "GET") {
      const peopleRows = await this.db.all<{
        person_id: string;
        email: string | null;
        email_verified_at: number | null;
        kick_user_id: string | null;
        role: string | null;
        kick_name: string | null;
        avatar_url: string | null;
        created_at: number;
        updated_at: number;
        active_sessions: number;
        raffle_entries_count: number;
        raffles_won_count: number;
      }>(
        `SELECT sp.id AS person_id,
                sp.email,
                sp.email_verified_at,
                sp.kick_user_id,
                sp.role,
                ka.name AS kick_name,
                ka.avatar_url,
                sp.created_at,
                sp.updated_at,
                (SELECT COUNT(*) FROM site_sessions ss WHERE ss.person_id = sp.id AND ss.expires_at > ?) AS active_sessions,
                (SELECT COUNT(*) FROM raffle_entries re WHERE sp.kick_user_id IS NOT NULL AND re.kick_user_id = sp.kick_user_id) AS raffle_entries_count,
                (SELECT COUNT(*) FROM raffles r WHERE ka.name IS NOT NULL AND r.winner IS NOT NULL AND LOWER(r.winner) = LOWER(ka.name)) AS raffles_won_count
         FROM site_people sp
         LEFT JOIN kick_accounts ka ON ka.kick_user_id = sp.kick_user_id
         ORDER BY sp.updated_at DESC`,
        now,
      );

      const orphanKicks = await this.db.all<{
        kick_user_id: string;
        kick_name: string;
        avatar_url: string;
        linked_at: number;
        updated_at: number;
        raffle_entries_count: number;
        raffles_won_count: number;
      }>(
        `SELECT ka.kick_user_id,
                ka.name AS kick_name,
                ka.avatar_url,
                ka.linked_at,
                ka.updated_at,
                (SELECT COUNT(*) FROM raffle_entries re WHERE re.kick_user_id = ka.kick_user_id) AS raffle_entries_count,
                (SELECT COUNT(*) FROM raffles r WHERE r.winner IS NOT NULL AND LOWER(r.winner) = LOWER(ka.name)) AS raffles_won_count
         FROM kick_accounts ka
         WHERE NOT EXISTS (SELECT 1 FROM site_people sp WHERE sp.kick_user_id = ka.kick_user_id)
         ORDER BY ka.updated_at DESC`,
      );

      const users = [
        ...peopleRows.map((r) => {
          const cleanKick = String(r.kick_name || "").trim();
          const cleanEmail = String(r.email || "").trim();
          const resolvedAvatar =
            r.kick_user_id && cleanKick
              ? buildLeaderboardAvatarUrl(cleanKick)
              : r.email_verified_at && cleanEmail
                ? buildLeaderboardAvatarUrl(cleanEmail.split("@")[0] || r.person_id)
                : buildNeutralAvatarUrl();
          return {
            id: r.person_id,
            person_id: r.person_id,
            email: r.email || "",
            email_verified: Boolean(r.email_verified_at),
            email_verified_at: r.email_verified_at,
            kick_user_id: r.kick_user_id || "",
            kick_name: r.kick_name || "",
            role: normalizeUserRole(r.role),
            avatar_url: resolvedAvatar,
            active_sessions: Number(r.active_sessions) || 0,
            raffle_entries_count: Number(r.raffle_entries_count) || 0,
            raffles_won_count: Number(r.raffles_won_count) || 0,
            created_at: Number(r.created_at) || 0,
            updated_at: Number(r.updated_at) || 0,
          };
        }),
        ...orphanKicks.map((k) => ({
          id: `kick:${k.kick_user_id}`,
          person_id: null,
          email: "",
          email_verified: false,
          email_verified_at: null,
          kick_user_id: k.kick_user_id,
          kick_name: k.kick_name || "",
          role: "player" as UserRole,
          avatar_url: buildNeutralAvatarUrl(),
          active_sessions: 0,
          raffle_entries_count: Number(k.raffle_entries_count) || 0,
          raffles_won_count: Number(k.raffles_won_count) || 0,
          created_at: Number(k.linked_at) || 0,
          updated_at: Number(k.updated_at) || 0,
        })),
      ].sort((a, b) => b.updated_at - a.updated_at);

      return jsonResponse({
        users,
        stats: {
          totalUsers: users.length,
          verifiedEmails: users.filter((u) => u.email_verified).length,
          linkedKick: users.filter((u) => Boolean(u.kick_user_id)).length,
          streamers: users.filter((u) => u.role === "streamer").length,
          admins: users.filter((u) => u.role === "admin").length,
          activeSessions: users.reduce((acc, u) => acc + u.active_sessions, 0),
          totalEntries: users.reduce((acc, u) => acc + u.raffle_entries_count, 0),
        },
      });
    }

    const rawId = asTrimmed(segs[0]);
    if (!rawId) return notFound();
    const isOrphanKick = rawId.startsWith("kick:");
    const kickKey = isOrphanKick ? rawId.slice("kick:".length) : "";

    if (segs.length === 1 && m === "GET") {
      if (isOrphanKick) {
        const ka = await this.db.first(
          `SELECT kick_user_id, name AS kick_name, avatar_url, linked_at, updated_at
           FROM kick_accounts WHERE kick_user_id = ?`,
          kickKey,
        );
        if (!ka) return notFound("User not found");
        const entries = await this.db.all(
          `SELECT re.id, re.raffle_id, re.created_at,
                  r.title, r.prize, r.winner, r.starts_at, r.ends_at, r.hidden
           FROM raffle_entries re
           LEFT JOIN raffles r ON r.id = re.raffle_id
           WHERE re.kick_user_id = ?
           ORDER BY re.created_at DESC`,
          kickKey,
        );
        return jsonResponse({
          user: {
            id: rawId,
            person_id: null,
            email: "",
            email_verified: false,
            email_verified_at: null,
            kick_user_id: ka.kick_user_id,
            kick_name: ka.kick_name || "",
            role: "player" as UserRole,
            avatar_url: buildNeutralAvatarUrl(),
            created_at: ka.linked_at,
            updated_at: ka.updated_at,
          },
          entries,
          sessions: [],
        });
      }

      const sp = await this.db.first(
        `SELECT sp.id AS person_id, sp.email, sp.email_verified_at, sp.kick_user_id, sp.role,
                sp.created_at, sp.updated_at, ka.name AS kick_name, ka.avatar_url
         FROM site_people sp
         LEFT JOIN kick_accounts ka ON ka.kick_user_id = sp.kick_user_id
         WHERE sp.id = ?`,
        rawId,
      );
      if (!sp) return notFound("User not found");

      const sessions = await this.db.all(
        `SELECT created_at, expires_at FROM site_sessions
         WHERE person_id = ? AND expires_at > ?
         ORDER BY created_at DESC`,
        rawId,
        now,
      );
      const entries = sp.kick_user_id
        ? await this.db.all(
          `SELECT re.id, re.raffle_id, re.created_at,
                    r.title, r.prize, r.winner, r.starts_at, r.ends_at, r.hidden
             FROM raffle_entries re
             LEFT JOIN raffles r ON r.id = re.raffle_id
             WHERE re.kick_user_id = ?
             ORDER BY re.created_at DESC`,
          sp.kick_user_id,
        )
        : [];

      const spKick = String(sp.kick_name || "").trim();
      const spEmail = String(sp.email || "").trim();
      const spAvatar =
        sp.kick_user_id && spKick
          ? buildLeaderboardAvatarUrl(spKick)
          : sp.email_verified_at && spEmail
            ? buildLeaderboardAvatarUrl(spEmail.split("@")[0] || String(sp.person_id))
            : buildNeutralAvatarUrl();

      return jsonResponse({
        user: {
          id: sp.person_id,
          person_id: sp.person_id,
          email: sp.email || "",
          email_verified: Boolean(sp.email_verified_at),
          email_verified_at: sp.email_verified_at,
          kick_user_id: sp.kick_user_id || "",
          kick_name: sp.kick_name || "",
          role: normalizeUserRole(sp.role),
          avatar_url: spAvatar,
          created_at: sp.created_at,
          updated_at: sp.updated_at,
        },
        entries,
        sessions,
      });
    }

    if (segs.length === 2 && segs[1] === "role" && m === "PATCH") {
      const body = await readBody(req);
      const rawRole = asTrimmed(body?.role).toLowerCase();
      if (rawRole !== "player" && rawRole !== "streamer" && rawRole !== "admin") {
        return badRequest("Invalid role");
      }
      const nextRole: UserRole = rawRole;

      if (isOrphanKick) {
        const ka = await this.db.first<{ kick_user_id: string; name: string }>(
          `SELECT kick_user_id, name FROM kick_accounts WHERE kick_user_id = ?`,
          kickKey,
        );
        if (!ka) return notFound("User not found");
        const existingPerson = await this.db.first<{ id: string }>(
          `SELECT id FROM site_people WHERE kick_user_id = ?`,
          kickKey,
        );
        if (existingPerson) {
          await this.db.run(
            `UPDATE site_people SET role = ?, updated_at = ? WHERE id = ?`,
            nextRole,
            now,
            existingPerson.id,
          );
          await this.audit.audit(actor, "user.role", existingPerson.id, {
            role: nextRole,
            kick_user_id: kickKey,
            kick_name: ka.name || null,
          });
          return jsonResponse({ ok: true, id: existingPerson.id, role: nextRole });
        }
        const createdId = randomB64url(16);
        await this.db.run(
          `INSERT INTO site_people (id, email, email_verified_at, kick_user_id, role, created_at, updated_at)
           VALUES (?, NULL, NULL, ?, ?, ?, ?)`,
          createdId,
          kickKey,
          nextRole,
          now,
          now,
        );
        await this.audit.audit(actor, "user.role", createdId, {
          role: nextRole,
          kick_user_id: kickKey,
          kick_name: ka.name || null,
        });
        return jsonResponse({ ok: true, id: createdId, role: nextRole });
      }

      const sp = await this.db.first<{ email: string | null; kick_user_id: string | null; role: string }>(
        `SELECT email, kick_user_id, role FROM site_people WHERE id = ?`,
        rawId,
      );
      if (!sp) return notFound("User not found");

      await this.db.run(
        `UPDATE site_people SET role = ?, updated_at = ? WHERE id = ?`,
        nextRole,
        now,
        rawId,
      );
      await this.audit.audit(actor, "user.role", rawId, {
        previous_role: normalizeUserRole(sp.role),
        role: nextRole,
        email: sp.email || null,
        kick_user_id: sp.kick_user_id || null,
      });
      return jsonResponse({ ok: true, id: rawId, role: nextRole });
    }

    if (segs.length === 2 && segs[1] === "revoke-sessions" && m === "POST") {
      if (isOrphanKick) {
        await this.db.run(`DELETE FROM kick_sessions WHERE kick_user_id = ?`, kickKey);
        await this.audit.audit(actor, "user.revoke_sessions", rawId, {});
        return jsonResponse({ ok: true, revoked: 0 });
      }
      const res = await this.db.run(`DELETE FROM site_sessions WHERE person_id = ?`, rawId);
      await this.audit.audit(actor, "user.revoke_sessions", rawId, { revoked: res.changes });
      return jsonResponse({ ok: true, revoked: res.changes });
    }

    if (segs.length === 1 && m === "DELETE") {
      if (isOrphanKick) {
        await this.db.batch([
          this.db.stmt(`DELETE FROM kick_sessions WHERE kick_user_id = ?`, kickKey),
          this.db.stmt(`DELETE FROM kick_accounts WHERE kick_user_id = ?`, kickKey),
        ]);
        await this.audit.audit(actor, "user.delete", rawId, {});
        return jsonResponse({ ok: true });
      }

      const sp = await this.db.first<{ email: string | null; kick_user_id: string | null }>(
        `SELECT email, kick_user_id FROM site_people WHERE id = ?`,
        rawId,
      );
      if (!sp) return notFound("User not found");

      await this.db.batch([
        this.db.stmt(`DELETE FROM site_sessions WHERE person_id = ?`, rawId),
        this.db.stmt(`DELETE FROM email_codes WHERE person_id = ?`, rawId),
        this.db.stmt(`DELETE FROM site_people WHERE id = ?`, rawId),
      ]);
      await this.audit.audit(actor, "user.delete", rawId, {
        email: sp.email || null,
        kick_user_id: sp.kick_user_id || null,
      });
      return jsonResponse({ ok: true });
    }

    return notFound();
  }

  private async handleSite(
    req: Request,
    segs: string[],
    m: string,
    actor: Actor,
  ): Promise<HttpResult> {
    if (segs.length === 1 && m === "DELETE") {
      const key = asTrimmed(segs[0]);
      if (!/^[a-z][a-z0-9_]{0,63}$/.test(key)) return badRequest("Invalid key");
      await this.db.run(`DELETE FROM site_settings WHERE key = ?`, key);
      await this.audit.audit(actor, "site.delete", key, {});
      return jsonResponse({ ok: true });
    }

    if (segs.length !== 0) return notFound();

    if (m === "GET") {
      const rows = await this.db.all<{ key: string; value: string }>(
        `SELECT key, value FROM site_settings`,
      );
      const settings: Record<string, string> = {};
      for (const r of rows) settings[r.key] = r.value;
      return jsonResponse({ settings });
    }

    if (m === "PUT") {
      const body = await readBody(req);
      const map = body && typeof body.settings === "object" && body.settings ? body.settings : null;
      if (!map) return badRequest("Settings object is required");
      const now = Date.now();
      const stmts: BoundStatement[] = [];
      const keys: string[] = [];

      for (const [rawKey, rawVal] of Object.entries(map)) {
        const key = asTrimmed(rawKey);
        if (!/^[a-z][a-z0-9_]{0,63}$/.test(key)) {
          return badRequest(`Invalid key: ${key}`);
        }
        const value = asString(rawVal);
        keys.push(key);
        stmts.push(
          this.db.stmt(
            `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
            key,
            value,
            now,
          ),
        );
      }

      if (stmts.length) await this.db.batch(stmts);
      await this.audit.audit(actor, "site.batch_set", `${keys.length} keys`, { keys });
      return jsonResponse({ ok: true, count: keys.length });
    }

    if (m === "POST") {
      const body = await readBody(req);
      if (!body || typeof body !== "object") return badRequest();
      const key = asTrimmed(body.key);
      if (!/^[a-z][a-z0-9_]{0,63}$/.test(key)) return badRequest("Invalid key");
      const value = asString(body.value);

      await this.db.run(
        `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        key,
        value,
        Date.now(),
      );

      await this.audit.audit(actor, "site.set", key, { len: value.length });
      return jsonResponse({ ok: true });
    }

    return notFound();
  }

  private async handleAudit(req: Request): Promise<HttpResult> {
    const params = searchParams(req);
    const rawLimit = Number(params.get("limit"));
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(500, Math.floor(rawLimit)) : 200;
    const domain = asTrimmed(params.get("domain")).toLowerCase();
    const q = asTrimmed(params.get("q")).toLowerCase();

    const clauses: string[] = [];
    const binds: (string | number)[] = [];

    if (domain && /^[a-z_]{2,24}$/.test(domain)) {
      if (domain === "leaderboards") {
        clauses.push(`(action LIKE 'lb.%' OR action LIKE 'spot%' OR action LIKE 'spots.%')`);
      } else if (domain === "players") {
        clauses.push(`(action LIKE 'player.%' OR action LIKE 'players.%')`);
      } else if (domain === "raffles") {
        clauses.push(`action LIKE 'raffle.%'`);
      } else if (domain === "users") {
        clauses.push(`action LIKE 'user.%'`);
      } else if (domain === "site") {
        clauses.push(`action LIKE 'site.%'`);
      } else if (domain === "demo") {
        clauses.push(`action LIKE 'demo.%'`);
      }
    }

    if (q) {
      const pattern = `%${q}%`;
      clauses.push(
        `(LOWER(COALESCE(actor_email, '')) LIKE ? OR LOWER(action) LIKE ? OR LOWER(COALESCE(target, '')) LIKE ? OR LOWER(COALESCE(meta_json, '')) LIKE ?)`,
      );
      binds.push(pattern, pattern, pattern, pattern);
    }

    const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const entries = await this.db.all(
      `SELECT * FROM audit_log ${whereSql} ORDER BY at DESC LIMIT ?`,
      ...binds,
      limit,
    );
    return jsonResponse({ entries });
  }
}
