/**
 * Automatic wagered growth (admin + Cron Trigger).
 */
import { Injectable, Logger } from "@nestjs/common";
import { AuditService } from "../audit/audit.module";
import {
  buildWagerGrowthSchedule,
  clampWagerGrowthIntervalMs,
  clampWagerGrowthPct,
  parseWagerGrowthSchedule,
  seededApproxPct,
  serializeWagerGrowthSchedule,
} from "../common/wager-growth-schedule";
import { DatabaseService, type BoundStatement, type Row } from "../database/database.service";
import { rankPlayersByWagered } from "../leaderboards/lb-rank";

export {
  buildWagerGrowthSchedule,
  clampWagerGrowthIntervalMs,
  clampWagerGrowthPct,
  parseWagerGrowthSchedule,
  serializeWagerGrowthSchedule,
};

const WAGER_GROWTH_TICK_CAP = 48;

function applyWagerGrowthTickSeeded(wageredCents: number, targetPct: number, seedStr: string): number {
  const w = Math.max(0, Number(wageredCents) || 0);
  const pct = seededApproxPct(targetPct, seedStr);
  const delta = Math.round((w * pct) / 100);
  return Math.max(0, w + delta);
}

export function wagerGrowthTicksDue(
  lastAt: number | null | undefined,
  intervalMs: number | null | undefined,
  now: number,
): number {
  const interval = clampWagerGrowthIntervalMs(intervalMs);
  if (!lastAt) return 1;
  const elapsed = now - Number(lastAt);
  if (elapsed < interval) return 0;
  return Math.min(Math.floor(elapsed / interval), WAGER_GROWTH_TICK_CAP);
}

export function refreshPlayerWagerGrowthSchedule(
  player: Row,
  defaultPct: number | null | undefined,
  defaultInterval: number | null | undefined,
  boardId: number,
  now: number,
): string {
  const enabled = player.wag_growth_enabled === 1 || player.wag_growth_enabled === "1";
  if (!enabled) return "";
  const pct = clampWagerGrowthPct(player.wag_growth_pct ?? defaultPct);
  const interval = clampWagerGrowthIntervalMs(
    player.wag_growth_hours ? Number(player.wag_growth_hours) * 3600000 : defaultInterval,
  );
  const items = buildWagerGrowthSchedule({
    playerId: player.id,
    boardId,
    startWageredCents: Number(player.wagered_cents) || 0,
    anchorMs: now,
    intervalMs: interval,
    targetPct: pct,
    now,
  });
  return serializeWagerGrowthSchedule(items);
}

@Injectable()
export class WagerGrowthService {
  private readonly logger = new Logger("WagerGrowth");

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  applyWagerGrowthForBoard(board: Row): {
    players: { id: number; username: string; wagered_cents: number }[];
    tickCount: number;
  } {
    const boardInterval = clampWagerGrowthIntervalMs(board.auto_wager_growth_interval_ms);
    const boardPct = clampWagerGrowthPct(board.auto_wager_growth_pct);
    const now = Date.now();

    const players = this.db.all(
      `SELECT id, username, wagered_cents, wag_growth_enabled, wag_growth_pct,
              wag_growth_hours, wag_growth_last_at, wag_growth_schedule_json
       FROM lb_players WHERE board_id = ? AND wag_growth_enabled = 1`,
      board.id,
    );

    if (!players.length) return { players: [], tickCount: 0 };

    const updated: { id: number; username: string; wagered_cents: number }[] = [];
    const stmts: BoundStatement[] = [];
    let tickCount = 0;

    for (const p of players) {
      const interval = clampWagerGrowthIntervalMs(
        p.wag_growth_hours ? Number(p.wag_growth_hours) * 3600000 : boardInterval,
      );
      const pct = clampWagerGrowthPct(p.wag_growth_pct ?? boardPct);
      const ticks = wagerGrowthTicksDue(p.wag_growth_last_at, interval, now);
      if (ticks <= 0) continue;

      const prevLast = Number(p.wag_growth_last_at);
      const anchor = prevLast || now;
      tickCount += ticks;
      let wagered = Number(p.wagered_cents) || 0;
      for (let i = 0; i < ticks; i++) {
        wagered = applyWagerGrowthTickSeeded(wagered, pct, `${p.id}:${board.id}:${anchor}:${i}`);
      }

      const lastAt = prevLast > 0 ? Math.min(now, prevLast + ticks * interval) : now;
      const freshSchedule = buildWagerGrowthSchedule({
        playerId: p.id,
        boardId: board.id,
        startWageredCents: wagered,
        anchorMs: lastAt,
        intervalMs: interval,
        targetPct: pct,
        now,
      });

      updated.push({ id: Number(p.id), username: String(p.username || ""), wagered_cents: wagered });
      stmts.push(
        this.db.stmt(
          `UPDATE lb_players SET wagered_cents = ?, wag_growth_last_at = ?, wag_growth_schedule_json = ?
           WHERE board_id = ? AND id = ?`,
          wagered,
          lastAt,
          serializeWagerGrowthSchedule(freshSchedule),
          board.id,
          p.id,
        ),
      );
    }

    if (stmts.length) this.db.batch(stmts);
    return { players: updated, tickCount };
  }

  runScheduledWagerGrowth(): { boards: number; tick_count: number; board_errors: number } {
    let boardsWithTicks = 0;
    let tickCount = 0;
    let boardErrors = 0;

    const now = Date.now();
    const boards = this.db.all(
      `SELECT id, slug, auto_wager_growth_enabled, auto_wager_growth_pct, auto_wager_growth_interval_ms,
              auto_rank_by_wagered
       FROM leaderboards
       WHERE auto_wager_growth_enabled = 1
         AND archived = 0
         AND hidden = 0
         AND starts_at <= ?
         AND ends_at > ?`,
      now,
      now,
    );

    for (const board of boards) {
      try {
        const { players, tickCount: ticks } = this.applyWagerGrowthForBoard(board);
        if (ticks <= 0) continue;
        boardsWithTicks++;
        tickCount += ticks;

        let ranked = 0;
        if (board.auto_rank_by_wagered) {
          ranked = rankPlayersByWagered(this.db, Number(board.id));
        }

        this.audit.audit(null, "lb.wager_growth", String(board.slug), {
          tick_count: ticks,
          players: players.length,
          ranked,
          source: "cron",
        });
      } catch (e) {
        boardErrors++;
        this.logger.error(`wager growth cron (${board.slug}): ${(e as Error)?.message || e}`);
      }
    }

    return { boards: boardsWithTicks, tick_count: tickCount, board_errors: boardErrors };
  }
}
