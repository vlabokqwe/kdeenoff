/**
 * Admin API for KDeenOff.
 * Ported from Spicy Stakes admin routes.
 */
import {
  asBool,
  asInt,
  asString,
  asTrimmed,
  isValidSlug,
  readBody,
  toSlug,
} from "../lib/validation.js";
import {
  badRequest,
  forbidden,
  jsonResponse,
  notFound,
  serverError,
} from "../lib/response.js";
import { verifyCsrf } from "../lib/csrf.js";
import { audit } from "../lib/audit.js";
import { rankPlayersByWagered } from "../lib/lb-rank.js";
import {
  applyWagerGrowthForBoard,
  clampWagerGrowthIntervalMs,
  clampWagerGrowthPct,
  refreshPlayerWagerGrowthSchedule,
} from "../lib/wager-growth.js";
import {
  loadSpotPrizes,
  upsertSpotHidden,
  upsertSpotPrize,
} from "../lib/lb-spot-prizes.js";

const ADMIN_ACTOR = { sub: 1, email: "admin@kdeenoff.com" };

export async function handleAdmin(request, env, url) {
  // CSRF validation for state-changing methods
  const csrf = verifyCsrf(request);
  if (!csrf.ok) return forbidden(csrf.error);

  const path = url.pathname.replace(/^\/api\/admin\/?/, "");
  const segs = path ? path.split("/").filter(Boolean) : [];
  const m = request.method;

  if (segs.length === 1 && segs[0] === "me" && m === "GET") {
    return jsonResponse({
      ok: true,
      role: "admin",
      user: ADMIN_ACTOR,
    });
  }

  // /api/admin/leaderboards...
  if (segs[0] === "leaderboards") {
    return handleLeaderboards(request, env, segs.slice(1), m);
  }

  // /api/admin/site
  if (segs[0] === "site") {
    return handleSite(request, env, segs.slice(1), m);
  }

  // /api/admin/audit
  if (segs[0] === "audit") {
    return handleAudit(env);
  }

  return notFound();
}

async function handleLeaderboards(request, env, segs, m) {
  if (!env.DB) return serverError("Database not configured");

  // GET /api/admin/leaderboards
  if (segs.length === 0 && m === "GET") {
    const rs = await env.DB.prepare(
      `SELECT l.*,
              (SELECT COUNT(*) FROM lb_players p WHERE p.board_id = l.id) AS player_count
       FROM leaderboards l
       ORDER BY l.archived ASC, l.ends_at DESC`,
    ).all();
    return jsonResponse({ boards: rs.results || [] });
  }

  // POST /api/admin/leaderboards
  if (segs.length === 0 && m === "POST") {
    const body = await readBody(request);
    if (!body) return badRequest("Invalid payload");

    const title = asTrimmed(body.title);
    if (!title) return badRequest("Title is required");

    let slug = toSlug(body.slug || title);
    if (!slug) slug = `board-${Date.now()}`;

    const subtitle = asTrimmed(body.subtitle);
    const startsAt = Number(body.starts_at) || Date.now();
    const endsAt = Number(body.ends_at) || Date.now() + 30 * 24 * 3600 * 1000;
    const prizePoolCents = Math.max(0, Math.floor(Number(body.prize_pool_cents) || 0));
    const partner = asTrimmed(body.partner) || "stake";
    const partnerUrl = asTrimmed(body.partner_signup_url) || "https://stake.com/?c=KDEENOFF";
    const avatarStyle = asTrimmed(body.avatar_style) || "fun-emoji";
    const now = Date.now();

    try {
      const res = await env.DB.prepare(
        `INSERT INTO leaderboards (
          slug, title, subtitle, starts_at, ends_at, prize_pool_cents,
          hidden, archived, partner_signup_url, partner, avatar_style,
          auto_rank_by_wagered, auto_wager_growth_enabled, auto_wager_growth_pct,
          auto_wager_growth_interval_ms, auto_hidden_above_rank, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 1, 0, 3, 43200000, 25, ?, ?)`,
      )
        .bind(slug, title, subtitle, startsAt, endsAt, prizePoolCents, partnerUrl, partner, avatarStyle, now, now)
        .run();

      audit(env, ADMIN_ACTOR, "lb.create", slug, { title, id: res.meta.last_row_id });
      return jsonResponse({ ok: true, slug, id: res.meta.last_row_id });
    } catch (e) {
      return badRequest(`Failed to create leaderboard: ${e.message}`);
    }
  }

  const slug = segs[0];
  const board = await env.DB.prepare(`SELECT * FROM leaderboards WHERE slug = ?`).bind(slug).first();
  if (!board) return notFound("Leaderboard not found");

  // GET /api/admin/leaderboards/:slug
  if (segs.length === 1 && m === "GET") {
    const playersRs = await env.DB.prepare(
      `SELECT * FROM lb_players WHERE board_id = ? ORDER BY sort_order ASC, wagered_cents DESC, id ASC`,
    )
      .bind(board.id)
      .all();
    const spots = await loadSpotPrizes(env, board.id);

    return jsonResponse({
      board,
      players: playersRs.results || [],
      spots,
    });
  }

  // PATCH /api/admin/leaderboards/:slug
  if (segs.length === 1 && m === "PATCH") {
    const body = await readBody(request);
    if (!body) return badRequest("Invalid payload");

    const title = body.title !== undefined ? asTrimmed(body.title) : board.title;
    const subtitle = body.subtitle !== undefined ? asTrimmed(body.subtitle) : board.subtitle;
    const startsAt = body.starts_at !== undefined ? Number(body.starts_at) : board.starts_at;
    const endsAt = body.ends_at !== undefined ? Number(body.ends_at) : board.ends_at;
    const prizePoolCents =
      body.prize_pool_cents !== undefined
        ? Math.max(0, Math.floor(Number(body.prize_pool_cents) || 0))
        : board.prize_pool_cents;
    const partner = body.partner !== undefined ? asTrimmed(body.partner) : board.partner;
    const partnerUrl =
      body.partner_signup_url !== undefined
        ? asTrimmed(body.partner_signup_url)
        : board.partner_signup_url;
    const avatarStyle =
      body.avatar_style !== undefined ? asTrimmed(body.avatar_style) : board.avatar_style;
    const autoRank =
      body.auto_rank_by_wagered !== undefined ? (asBool(body.auto_rank_by_wagered) ? 1 : 0) : board.auto_rank_by_wagered;
    const growthEnabled =
      body.auto_wager_growth_enabled !== undefined
        ? (asBool(body.auto_wager_growth_enabled) ? 1 : 0)
        : board.auto_wager_growth_enabled;
    const growthPct =
      body.auto_wager_growth_pct !== undefined
        ? clampWagerGrowthPct(body.auto_wager_growth_pct)
        : board.auto_wager_growth_pct;
    const growthInterval =
      body.auto_wager_growth_interval_ms !== undefined
        ? clampWagerGrowthIntervalMs(body.auto_wager_growth_interval_ms)
        : board.auto_wager_growth_interval_ms;
    const autoHidden =
      body.auto_hidden_above_rank !== undefined
        ? Math.max(0, asInt(body.auto_hidden_above_rank) || 0)
        : board.auto_hidden_above_rank;
    const hidden = body.hidden !== undefined ? (asBool(body.hidden) ? 1 : 0) : board.hidden;
    const now = Date.now();

    await env.DB.prepare(
      `UPDATE leaderboards SET
        title = ?, subtitle = ?, starts_at = ?, ends_at = ?, prize_pool_cents = ?,
        partner = ?, partner_signup_url = ?, avatar_style = ?, auto_rank_by_wagered = ?,
        auto_wager_growth_enabled = ?, auto_wager_growth_pct = ?,
        auto_wager_growth_interval_ms = ?, auto_hidden_above_rank = ?, hidden = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(
        title, subtitle, startsAt, endsAt, prizePoolCents, partner, partnerUrl,
        avatarStyle, autoRank, growthEnabled, growthPct, growthInterval, autoHidden, hidden, now, board.id,
      )
      .run();

    audit(env, ADMIN_ACTOR, "lb.update", slug, { title, prizePoolCents });
    return jsonResponse({ ok: true });
  }

  // DELETE /api/admin/leaderboards/:slug
  if (segs.length === 1 && m === "DELETE") {
    await env.DB.prepare(`DELETE FROM leaderboards WHERE id = ?`).bind(board.id).run();
    audit(env, ADMIN_ACTOR, "lb.delete", slug, {});
    return jsonResponse({ ok: true });
  }

  // POST /api/admin/leaderboards/:slug/archive
  if (segs.length === 2 && segs[1] === "archive" && m === "POST") {
    await env.DB.prepare(`UPDATE leaderboards SET archived = 1, updated_at = ? WHERE id = ?`)
      .bind(Date.now(), board.id)
      .run();
    audit(env, ADMIN_ACTOR, "lb.archive", slug, {});
    return jsonResponse({ ok: true });
  }

  // POST /api/admin/leaderboards/:slug/unarchive
  if (segs.length === 2 && segs[1] === "unarchive" && m === "POST") {
    await env.DB.prepare(`UPDATE leaderboards SET archived = 0, updated_at = ? WHERE id = ?`)
      .bind(Date.now(), board.id)
      .run();
    audit(env, ADMIN_ACTOR, "lb.unarchive", slug, {});
    return jsonResponse({ ok: true });
  }

  // PLAYERS sub-routes
  if (segs[1] === "players") {
    // POST /api/admin/leaderboards/:slug/players (add player)
    if (segs.length === 2 && m === "POST") {
      const body = await readBody(request);
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

      const countRs = await env.DB.prepare(`SELECT COUNT(*) as c FROM lb_players WHERE board_id = ?`)
        .bind(board.id)
        .first();
      const nextRank = (countRs?.c || 0) + 1;

      const ins = await env.DB.prepare(
        `INSERT INTO lb_players (
          board_id, rank, sort_order, username, wagered_cents, prize_cents,
          avatar_url, avatar_sid, wag_growth_enabled, wag_growth_pct, wag_growth_hours,
          wag_growth_last_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          board.id, nextRank, nextRank, username, wagered, prize, avatarUrl, avatarSid,
          wagGrowth, wagPct, wagHours, Date.now(),
        )
        .run();

      if (board.auto_rank_by_wagered) {
        await rankPlayersByWagered(env, board.id);
      }

      audit(env, ADMIN_ACTOR, "player.add", `${slug}:${username}`, { wagered, prize });
      return jsonResponse({ ok: true, id: ins.meta.last_row_id });
    }

    // POST /api/admin/leaderboards/:slug/players/auto-rank
    if (segs.length === 3 && segs[2] === "auto-rank" && m === "POST") {
      const count = await rankPlayersByWagered(env, board.id);
      audit(env, ADMIN_ACTOR, "players.auto_rank", slug, { count });
      return jsonResponse({ ok: true, count });
    }

    // POST /api/admin/leaderboards/:slug/players/apply-wager-growth
    if (segs.length === 3 && segs[2] === "apply-wager-growth" && m === "POST") {
      const { players, tickCount } = await applyWagerGrowthForBoard(env, board);
      if (board.auto_rank_by_wagered) {
        await rankPlayersByWagered(env, board.id);
      }
      audit(env, ADMIN_ACTOR, "players.wager_growth", slug, { tickCount, players: players.length });
      return jsonResponse({ ok: true, tickCount, players });
    }

    // POST /api/admin/leaderboards/:slug/players/import-csv
    if (segs.length === 3 && segs[2] === "import-csv" && m === "POST") {
      const body = await readBody(request);
      const csvText = asString(body?.csv || body?.text);
      if (!csvText) return badRequest("CSV text is required");

      const rows = parseCsv(csvText);
      if (!rows.length) return badRequest("Empty CSV");

      let imported = 0;
      const stmts = [];
      for (const row of rows) {
        const username = asTrimmed(row[0]);
        if (!username || username.toLowerCase() === "username" || username.toLowerCase() === "player") {
          continue;
        }
        const wagered = Math.max(0, Math.floor(Number(row[1]) * 100 || Number(row[1]) || 0));
        const prize = Math.max(0, Math.floor(Number(row[2]) * 100 || Number(row[2]) || 0));
        imported++;
        stmts.push(
          env.DB.prepare(
            `INSERT INTO lb_players (board_id, rank, sort_order, username, wagered_cents, prize_cents, avatar_sid, wag_growth_last_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ).bind(board.id, imported, imported, username, wagered, prize, username.toLowerCase(), Date.now()),
        );
      }

      if (stmts.length) {
        await env.DB.batch(stmts);
        if (board.auto_rank_by_wagered) {
          await rankPlayersByWagered(env, board.id);
        }
      }

      audit(env, ADMIN_ACTOR, "players.import_csv", slug, { count: imported });
      return jsonResponse({ ok: true, imported });
    }

    // Specific player: /api/admin/leaderboards/:slug/players/:id
    const playerId = asInt(segs[2]);
    if (!playerId) return notFound();

    // PATCH /api/admin/leaderboards/:slug/players/:id
    if (segs.length === 3 && m === "PATCH") {
      const body = await readBody(request);
      if (!body) return badRequest("Invalid payload");

      const player = await env.DB.prepare(
        `SELECT * FROM lb_players WHERE board_id = ? AND id = ?`,
      )
        .bind(board.id, playerId)
        .first();
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
          ? (asBool(body.wag_growth_enabled) ? 1 : 0)
          : player.wag_growth_enabled;
      const wagPct =
        body.wag_growth_pct !== undefined ? clampWagerGrowthPct(body.wag_growth_pct) : player.wag_growth_pct;
      const wagHours =
        body.wag_growth_hours !== undefined ? Number(body.wag_growth_hours) : player.wag_growth_hours;

      await env.DB.prepare(
        `UPDATE lb_players SET
          username = ?, wagered_cents = ?, prize_cents = ?, avatar_url = ?,
          wag_growth_enabled = ?, wag_growth_pct = ?, wag_growth_hours = ?
         WHERE board_id = ? AND id = ?`,
      )
        .bind(username, wagered, prize, avatarUrl, wagGrowth, wagPct, wagHours, board.id, playerId)
        .run();

      if (board.auto_rank_by_wagered) {
        await rankPlayersByWagered(env, board.id);
      }

      audit(env, ADMIN_ACTOR, "player.update", `${slug}:${playerId}`, { username, wagered, prize });
      return jsonResponse({ ok: true });
    }

    // DELETE /api/admin/leaderboards/:slug/players/:id
    if (segs.length === 3 && m === "DELETE") {
      await env.DB.prepare(`DELETE FROM lb_players WHERE board_id = ? AND id = ?`)
        .bind(board.id, playerId)
        .run();
      if (board.auto_rank_by_wagered) {
        await rankPlayersByWagered(env, board.id);
      }
      audit(env, ADMIN_ACTOR, "player.delete", `${slug}:${playerId}`, {});
      return jsonResponse({ ok: true });
    }
  }

  // PATCH /api/admin/leaderboards/:slug/spots/:rank
  if (segs[1] === "spots" && segs.length === 3 && m === "PATCH") {
    const rank = asInt(segs[2]);
    if (!rank || rank < 1) return badRequest("Invalid spot rank");
    const body = await readBody(request);
    if (!body) return badRequest("Invalid payload");

    if (body.prize_cents !== undefined) {
      await upsertSpotPrize(env, board.id, rank, body.prize_cents);
    }
    if (body.hidden !== undefined) {
      await upsertSpotHidden(env, board.id, rank, asBool(body.hidden));
    }

    audit(env, ADMIN_ACTOR, "spot.update", `${slug}:rank-${rank}`, body);
    return jsonResponse({ ok: true });
  }

  return notFound();
}

async function handleSite(request, env, segs, m) {
  if (!env.DB) return serverError("Database not configured");
  if (segs.length !== 0) return notFound();

  if (m === "GET") {
    const rs = await env.DB.prepare(`SELECT key, value FROM site_settings`).all();
    const settings = {};
    for (const r of rs.results || []) settings[r.key] = r.value;
    return jsonResponse({ settings });
  }

  if (m === "POST") {
    const body = await readBody(request);
    if (!body || typeof body !== "object") return badRequest();
    const key = asTrimmed(body.key);
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(key)) return badRequest("Invalid key");
    const value = asString(body.value);

    await env.DB.prepare(
      `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
      .bind(key, value, Date.now())
      .run();

    audit(env, ADMIN_ACTOR, "site.set", key, { len: value.length });
    return jsonResponse({ ok: true });
  }

  return notFound();
}

async function handleAudit(env) {
  if (!env.DB) return jsonResponse({ entries: [] });
  const rs = await env.DB.prepare(
    `SELECT * FROM audit_log ORDER BY at DESC LIMIT 100`,
  ).all();
  return jsonResponse({ entries: rs.results || [] });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
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
