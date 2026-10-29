/**
 * Automatic wagered growth (admin + Cron Trigger).
 */

import { audit } from "./audit.js";
import { rankPlayersByWagered } from "./lb-rank.js";
import {
  buildWagerGrowthSchedule,
  clampWagerGrowthIntervalMs,
  clampWagerGrowthPct,
  parseWagerGrowthSchedule,
  seededApproxPct,
  serializeWagerGrowthSchedule,
} from "./wager-growth-schedule.js";

export {
  buildWagerGrowthSchedule,
  clampWagerGrowthIntervalMs,
  clampWagerGrowthPct,
  parseWagerGrowthSchedule,
  serializeWagerGrowthSchedule,
} from "./wager-growth-schedule.js";

const WAGER_GROWTH_TICK_CAP = 48;

function applyWagerGrowthTickSeeded(wageredCents, targetPct, seedStr) {
  const w = Math.max(0, Number(wageredCents) || 0);
  const pct = seededApproxPct(targetPct, seedStr);
  const delta = Math.round((w * pct) / 100);
  return Math.max(0, w + delta);
}

export function wagerGrowthTicksDue(lastAt, intervalMs, now) {
  const interval = clampWagerGrowthIntervalMs(intervalMs);
  if (!lastAt) return 1;
  const elapsed = now - Number(lastAt);
  if (elapsed < interval) return 0;
  return Math.min(Math.floor(elapsed / interval), WAGER_GROWTH_TICK_CAP);
}

export function refreshPlayerWagerGrowthSchedule(player, defaultPct, defaultInterval, boardId, now) {
  const enabled = player.wag_growth_enabled === 1 || player.wag_growth_enabled === "1";
  if (!enabled) return "";
  const pct = clampWagerGrowthPct(player.wag_growth_pct ?? defaultPct);
  const interval = clampWagerGrowthIntervalMs(
    player.wag_growth_hours ? player.wag_growth_hours * 3600000 : defaultInterval,
  );
  const items = buildWagerGrowthSchedule({
    playerId: player.id,
    boardId,
    startWageredCents: player.wagered_cents,
    anchorMs: now,
    intervalMs: interval,
    targetPct: pct,
    now,
  });
  return serializeWagerGrowthSchedule(items);
}

export async function applyWagerGrowthForBoard(env, board) {
  if (!env.DB) return { players: [], tickCount: 0 };
  const boardInterval = clampWagerGrowthIntervalMs(board.auto_wager_growth_interval_ms);
  const boardPct = clampWagerGrowthPct(board.auto_wager_growth_pct);
  const now = Date.now();

  const rs = await env.DB.prepare(
    `SELECT id, username, wagered_cents, wag_growth_enabled, wag_growth_pct,
            wag_growth_hours, wag_growth_last_at, wag_growth_schedule_json
     FROM lb_players WHERE board_id = ? AND wag_growth_enabled = 1`,
  )
    .bind(board.id)
    .all();

  const players = rs.results || [];
  if (!players.length) return { players: [], tickCount: 0 };

  const updated = [];
  const stmts = [];
  let tickCount = 0;

  for (const p of players) {
    const interval = clampWagerGrowthIntervalMs(
      p.wag_growth_hours ? p.wag_growth_hours * 3600000 : boardInterval,
    );
    const pct = clampWagerGrowthPct(p.wag_growth_pct ?? boardPct);
    const ticks = wagerGrowthTicksDue(p.wag_growth_last_at, interval, now);
    if (ticks <= 0) continue;

    tickCount += ticks;
    let wagered = Number(p.wagered_cents) || 0;
    for (let i = 0; i < ticks; i++) {
      wagered = applyWagerGrowthTickSeeded(wagered, pct, `${p.id}:${board.id}:${i}`);
    }

    const lastAt = now;
    const freshSchedule = buildWagerGrowthSchedule({
      playerId: p.id,
      boardId: board.id,
      startWageredCents: wagered,
      anchorMs: lastAt,
      intervalMs: interval,
      targetPct: pct,
      now,
    });

    updated.push({ id: p.id, username: p.username, wagered_cents: wagered });
    stmts.push(
      env.DB.prepare(
        `UPDATE lb_players SET wagered_cents = ?, wag_growth_last_at = ?, wag_growth_schedule_json = ?
         WHERE board_id = ? AND id = ?`,
      ).bind(wagered, lastAt, serializeWagerGrowthSchedule(freshSchedule), board.id, p.id),
    );
  }

  if (stmts.length) await env.DB.batch(stmts);
  return { players: updated, tickCount };
}

export async function runScheduledWagerGrowth(env) {
  if (!env.DB) return { boards: 0, tick_count: 0, board_errors: 0 };
  let boardsWithTicks = 0;
  let tickCount = 0;
  let boardErrors = 0;

  const rs = await env.DB.prepare(
    `SELECT id, slug, auto_wager_growth_enabled, auto_wager_growth_pct, auto_wager_growth_interval_ms,
            auto_rank_by_wagered
     FROM leaderboards WHERE auto_wager_growth_enabled = 1`,
  ).all();

  for (const board of rs.results || []) {
    try {
      const { players, tickCount: ticks } = await applyWagerGrowthForBoard(env, board);
      if (ticks <= 0) continue;
      boardsWithTicks++;
      tickCount += ticks;

      let ranked = 0;
      if (board.auto_rank_by_wagered) {
        ranked = await rankPlayersByWagered(env, board.id);
      }

      await audit(env, null, "lb.wager_growth", board.slug, {
        tick_count: ticks,
        players: players.length,
        ranked,
        source: "cron",
      });
    } catch (e) {
      boardErrors++;
      console.error("wager growth cron:", board.slug, e);
    }
  }

  return { boards: boardsWithTicks, tick_count: tickCount, board_errors: boardErrors };
}
