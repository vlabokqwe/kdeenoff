/**
 * Public raffle list, single raffle detail, raffle entry, streamer management, and admin CRUD.
 * Public GET /api/raffles returns live raffles currently open or running elimination spins.
 * Public GET /api/raffles/:id returns a raffle with its participant list (streamers/admins can also view hidden ones).
 * Streamer/Admin /api/raffles/manage/* and /api/admin/raffles/* share full raffle management & spin controls.
 */
import { Injectable, Logger } from "@nestjs/common";
import type { Request } from "express";
import { AccessService } from "../access/access.service";
import { type Actor, AuditService } from "../audit/audit.module";
import { verifyCsrf, verifySameOrigin } from "../common/csrf";
import { readBody } from "../common/http/read-body";
import { normalizedPath } from "../common/http/request";
import {
  type HttpResult,
  badRequest,
  forbidden,
  jsonResponse,
  methodNotAllowed,
  notFound,
  serverError,
  unauthorized,
} from "../common/http/response";
import { ROUTE_ID_RE, asBool, asInt, asTrimmed } from "../common/validation";
import { DatabaseService, type BoundStatement, type Row } from "../database/database.service";
import { buildLeaderboardAvatarUrl, buildNeutralAvatarUrl } from "../leaderboards/lb-avatar";
import { SessionService } from "../session/session.service";

const TITLE_MAX = 120;
const PRIZE_MAX = 120;
const NOTE_MAX = 500;
const WINNER_MAX = 80;

/** Sentinel timestamp (2100-01-01T00:00:00Z) used for open manual-draw raffles. */
export const MANUAL_OPEN_ENDS_AT = 4_102_444_800_000;

export type RaffleEndMode = "timer" | "manual";
export type RaffleSpinMode = "winner" | "elimination";
export type RaffleSpinSpeed = "normal" | "fast" | "instant";

function raffleId(seg: unknown): number | null {
  if (!/^\d+$/.test(String(seg || ""))) return null;
  const n = Number(seg);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

function secureRandomIndex(count: number): number {
  if (count <= 1) return 0;
  const maxUint = 0x100000000;
  const limit = maxUint - (maxUint % count);
  const buf = new Uint32Array(1);
  let val = 0;
  do {
    crypto.getRandomValues(buf);
    val = buf[0];
  } while (val >= limit);
  return val % count;
}

function pickRandomSubset<T>(items: T[], count: number): T[] {
  if (count <= 0 || items.length === 0) return [];
  if (count >= items.length) return [...items];
  const copy = [...items];
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    const idx = i + secureRandomIndex(copy.length - i);
    const tmp = copy[i];
    copy[i] = copy[idx];
    copy[idx] = tmp;
    out.push(copy[i]);
  }
  return out;
}

function clip(value: unknown, max: number): string {
  const text = asTrimmed(value);
  return text.length > max ? text.slice(0, max) : text;
}

function optionalText(value: unknown, max: number): string | null {
  const text = clip(value, max);
  return text || null;
}

function asTime(value: unknown, fallback: number | null): number | null {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export function normalizeSpinMode(raw: unknown): RaffleSpinMode {
  return String(raw || "").trim().toLowerCase() === "elimination" ? "elimination" : "winner";
}

export function normalizeSpinSpeed(raw: unknown): RaffleSpinSpeed {
  const clean = String(raw || "").trim().toLowerCase();
  if (clean === "fast" || clean === "instant") return clean;
  return "normal";
}

export function normalizeSpinDurationMs(
  raw: unknown,
  fallbackSpeed: RaffleSpinSpeed = "normal",
): number {
  if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) {
      const rounded = Math.round(n);
      if (rounded <= 0) return 0;
      return Math.max(300, Math.min(120_000, rounded));
    }
  }
  if (fallbackSpeed === "instant") return 0;
  if (fallbackSpeed === "fast") return 2000;
  return 4000;
}

interface RaffleFields {
  title: string;
  prize: string;
  note: string | null;
  winner: string | null;
  startsAt: number;
  endsAt: number;
  endMode: RaffleEndMode;
  endedAt: number | null;
  spinMode: RaffleSpinMode;
  spinSpeed: RaffleSpinSpeed;
  spinDurationMs: number;
  excludePrevWinner: number;
  entriesLocked: number;
  hidden: number;
  isDemo: number;
  clearSpinMeta: boolean;
}

function fieldsFrom(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any,
  current: Row | null,
): RaffleFields | { error: string } {
  const now = Date.now();
  const title = clip(body.title !== undefined ? body.title : current?.title, TITLE_MAX);
  if (!title) return { error: "Title is required" };

  const prize = clip(body.prize !== undefined ? body.prize : current?.prize, PRIZE_MAX);
  const note = body.note !== undefined ? optionalText(body.note, NOTE_MAX) : current?.note || null;
  const winnerExplicitlyProvided = body.winner !== undefined;
  const winner = winnerExplicitlyProvided
    ? optionalText(body.winner, WINNER_MAX)
    : current?.winner || null;

  const rawMode =
    body.end_mode !== undefined
      ? asTrimmed(body.end_mode).toLowerCase()
      : String(current?.end_mode || "timer").toLowerCase();
  if (rawMode !== "timer" && rawMode !== "manual") {
    return { error: "Invalid end mode" };
  }
  const endMode: RaffleEndMode = rawMode;

  let spinMode: RaffleSpinMode = current ? normalizeSpinMode(current.spin_mode) : "winner";
  if (body.spin_mode !== undefined) {
    const rawSpin = asTrimmed(body.spin_mode).toLowerCase();
    if (rawSpin !== "winner" && rawSpin !== "elimination") {
      return { error: "Invalid spin mode" };
    }
    spinMode = rawSpin;
  }

  let spinSpeed: RaffleSpinSpeed = current ? normalizeSpinSpeed(current.spin_speed) : "normal";
  if (body.spin_speed !== undefined) {
    const rawSpeed = asTrimmed(body.spin_speed).toLowerCase();
    if (rawSpeed !== "normal" && rawSpeed !== "fast" && rawSpeed !== "instant") {
      return { error: "Invalid spin speed" };
    }
    spinSpeed = rawSpeed;
  }

  let spinDurationMs = current
    ? normalizeSpinDurationMs(current.spin_duration_ms, spinSpeed)
    : normalizeSpinDurationMs(undefined, spinSpeed);
  if (body.spin_duration_ms !== undefined) {
    const n = Number(body.spin_duration_ms);
    if (!Number.isFinite(n) || n < 0 || n > 120_000) {
      return { error: "Spin duration must be between 0 and 120 seconds" };
    }
    spinDurationMs = normalizeSpinDurationMs(n, spinSpeed);
    spinSpeed = spinDurationMs === 0 ? "instant" : spinDurationMs <= 2200 ? "fast" : "normal";
  } else if (body.spin_speed !== undefined) {
    spinDurationMs = normalizeSpinDurationMs(undefined, spinSpeed);
  }

  let excludePrevWinner = current ? (Number(current.exclude_prev_winner ?? 1) ? 1 : 0) : 1;
  if (body.exclude_prev_winner !== undefined) {
    const flag = asBool(body.exclude_prev_winner);
    if (flag == null) return { error: "Invalid exclude_prev_winner flag" };
    excludePrevWinner = flag ? 1 : 0;
  }

  let entriesLocked = current ? (Number(current.entries_locked) ? 1 : 0) : 0;
  if (body.entries_locked !== undefined) {
    const flag = asBool(body.entries_locked);
    if (flag == null) return { error: "Invalid entries_locked flag" };
    entriesLocked = flag ? 1 : 0;
  }

  const startsAt = asTime(body.starts_at, current ? Number(current.starts_at) : now);
  if (startsAt == null) return { error: "Invalid start date" };

  let endsAt: number | null = null;
  let endedAt: number | null =
    current?.ended_at != null && Number.isFinite(Number(current.ended_at))
      ? Number(current.ended_at)
      : null;

  const reopen = asBool(body.reopen) === true;
  const bumpMs = body.bump_ms !== undefined ? asInt(body.bump_ms) : null;
  if (body.bump_ms !== undefined && bumpMs == null) {
    return { error: "Invalid timer adjustment" };
  }

  if (endMode === "manual") {
    if (reopen || endedAt == null) {
      endedAt = null;
      endsAt = MANUAL_OPEN_ENDS_AT;
    } else {
      endsAt = Number(current?.ends_at) || endedAt;
    }
  } else {
    const switchedFromOpenManual =
      current?.end_mode === "manual" &&
      endedAt == null &&
      body.ends_at === undefined &&
      bumpMs == null;
    if (switchedFromOpenManual) {
      endsAt = now + 3_600_000;
    } else if (bumpMs != null) {
      const curEnds =
        current && current.end_mode !== "manual" && Number(current.ends_at) > now
          ? Number(current.ends_at)
          : now;
      const minAllowed = Math.max(startsAt + 15_000, now + 15_000);
      endsAt = Math.max(minAllowed, curEnds + bumpMs);
      endedAt = null;
    } else {
      endsAt = asTime(body.ends_at, current ? Number(current.ends_at) : null);
      if (endsAt == null) return { error: "End date is required" };
      if (reopen && endsAt <= now) {
        endsAt = now + 3_600_000;
      }
      if (endsAt < startsAt) return { error: "End date is before start date" };
      if (endsAt > now || reopen) {
        endedAt = null;
      }
    }
  }

  if (reopen && body.entries_locked === undefined) {
    entriesLocked = 0;
  }

  let hidden = current ? (current.hidden ? 1 : 0) : 0;
  if (body.hidden !== undefined) {
    const flag = asBool(body.hidden);
    if (flag == null) return { error: "Invalid hidden flag" };
    hidden = flag ? 1 : 0;
  }

  let isDemo = current ? (current.is_demo ? 1 : 0) : 0;
  if (body.is_demo !== undefined) {
    const flag = asBool(body.is_demo);
    if (flag == null) return { error: "Invalid is_demo flag" };
    isDemo = flag ? 1 : 0;
  }

  const clearSpinMeta = Boolean(reopen || (winnerExplicitlyProvided && !winner));

  return {
    title,
    prize,
    note,
    winner,
    startsAt,
    endsAt,
    endMode,
    endedAt,
    spinMode,
    spinSpeed,
    spinDurationMs,
    excludePrevWinner,
    entriesLocked,
    hidden,
    isDemo,
    clearSpinMeta,
  };
}

interface EntryRowWithAccount {
  id: number;
  kick_user_id: string;
  kick_name: string | null;
  person_id: string | null;
  eliminated_at: number | null;
  eliminated_order: number | null;
}

@Injectable()
export class RafflesService {
  private readonly logger = new Logger("Raffles");

  constructor(
    private readonly db: DatabaseService,
    private readonly session: SessionService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) { }

  private appendRaffleWinnerStmt(
    raffleId: number,
    winnerName: string,
    kickUserId: string | null | undefined,
    createdAt: number,
  ): BoundStatement | null {
    const clean = String(winnerName || "").trim();
    if (!clean) return null;
    return this.db.stmt(
      `INSERT INTO raffle_winners (raffle_id, kick_user_id, winner_name, created_at)
       VALUES (?, ?, ?, ?)`,
      raffleId,
      kickUserId ? String(kickUserId).trim() : null,
      clip(clean, WINNER_MAX),
      createdAt,
    );
  }

  private async appendRaffleWinner(
    raffleId: number,
    winnerName: string,
    kickUserId: string | null | undefined,
    createdAt: number,
  ): Promise<void> {
    const stmt = this.appendRaffleWinnerStmt(raffleId, winnerName, kickUserId, createdAt);
    if (stmt) await this.db.run(stmt.sql, ...stmt.params);
  }

  private clearRaffleWinnersStmt(raffleId: number): BoundStatement {
    return this.db.stmt(`DELETE FROM raffle_winners WHERE raffle_id = ?`, raffleId);
  }

  async getActiveRaffleBan(
    kickUserId: string | null | undefined,
    now = Date.now(),
  ): Promise<{ isPermanent: boolean; bannedUntil: number | null } | null> {
    const cleanId = String(kickUserId || "").trim();
    if (!cleanId) return null;
    const row = await this.db.first<{
      is_permanent: number;
      banned_until: number | null;
    }>(
      `SELECT is_permanent, banned_until FROM raffle_bans WHERE kick_user_id = ?`,
      cleanId,
    );
    if (!row) return null;
    if (Number(row.is_permanent)) {
      return { isPermanent: true, bannedUntil: null };
    }
    const until = row.banned_until != null ? Number(row.banned_until) : 0;
    if (until > now) {
      return { isPermanent: false, bannedUntil: until };
    }
    return null;
  }

  /**
   * Automatically finalize countdown-timer raffles once `ends_at <= now`.
   * For standard `winner` mode, draws a cryptographic winner from active `raffle_entries`.
   * For `elimination` mode with 2+ active players, locks entries so the streamer can run elimination spins.
   */
  async finalizeExpiredTimerRaffles(now = Date.now()): Promise<void> {
    const expired = await this.db.all<{ id: number }>(
      `SELECT id FROM raffles
       WHERE end_mode != 'manual'
         AND ended_at IS NULL
         AND ends_at <= ?
         AND NOT (spin_mode = 'elimination' AND entries_locked = 1)`,
      now,
    );
    if (!expired.length) return;

    try {
      for (const item of expired) {
        const id = Number(item.id);
        const current = await this.db.first(
          `SELECT id, title, winner, ends_at, end_mode, ended_at, spin_mode, entries_locked
           FROM raffles WHERE id = ?`,
          id,
        );
        if (
          !current ||
          current.end_mode === "manual" ||
          current.ended_at != null ||
          Number(current.ends_at) > now
        ) {
          continue;
        }

        const spinMode = normalizeSpinMode(current.spin_mode);
        const endedAt = Number(current.ends_at) || now;
        const existingWinner = current.winner ? String(current.winner).trim() : "";

        const activeEntries = await this.db.all<{
          id: number;
          kick_user_id: string;
          kick_name: string | null;
        }>(
          `SELECT e.id, e.kick_user_id, ka.name AS kick_name
           FROM raffle_entries e
           LEFT JOIN kick_accounts ka ON ka.kick_user_id = e.kick_user_id
           WHERE e.raffle_id = ? AND e.eliminated_at IS NULL
           ORDER BY e.id ASC`,
          id,
        );

        if (spinMode === "elimination" && !existingWinner && activeEntries.length > 1) {
          if (!Number(current.entries_locked)) {
            await this.db.run(
              `UPDATE raffles SET entries_locked = 1, updated_at = ? WHERE id = ? AND ended_at IS NULL`,
              now,
              id,
            );
          }
          continue;
        }

        let winnerName: string | null = existingWinner || null;
        let pickedKickUserId: string | null = null;
        const entryCount = activeEntries.length;

        if (!winnerName && activeEntries.length > 0) {
          const pickedIdx = secureRandomIndex(activeEntries.length);
          const picked = activeEntries[pickedIdx];
          const fallbackLabel = `Viewer #${pickedIdx + 1}`;
          winnerName = clip(picked.kick_name || fallbackLabel, WINNER_MAX);
          pickedKickUserId = picked.kick_user_id;
        }

        const newlyDrawn = !existingWinner && Boolean(winnerName);
        const upd = await this.db.run(
          `UPDATE raffles
           SET winner = ?,
               ended_at = ?,
               entries_locked = 1,
               last_spin_kind = CASE WHEN ? = 1 THEN 'winner' ELSE last_spin_kind END,
               last_spin_at = CASE WHEN ? = 1 THEN ? ELSE last_spin_at END,
               updated_at = ?
           WHERE id = ? AND ended_at IS NULL`,
          winnerName,
          endedAt,
          newlyDrawn ? 1 : 0,
          newlyDrawn ? 1 : 0,
          now,
          now,
          id,
        );

        if (upd.changes > 0 && newlyDrawn && winnerName) {
          await this.appendRaffleWinner(id, winnerName, pickedKickUserId, endedAt);
        }

        await this.audit.audit({ sub: 0, email: "timer" }, "raffle.auto_finish", String(id), {
          title: current.title,
          winner: winnerName,
          kick_user_id: pickedKickUserId,
          entry_count: entryCount,
        });
      }
    } catch (err) {
      this.logger.error(`auto-finalize timer raffles failed: ${(err as Error)?.message || err}`);
    }
  }

  private async joinedRaffleIds(kickUserId: string | null | undefined): Promise<number[]> {
    if (!kickUserId) return [];
    const now = Date.now();
    const rows = await this.db.all(
      `SELECT e.raffle_id FROM raffle_entries e
       JOIN raffles r ON r.id = e.raffle_id
       WHERE e.kick_user_id = ? AND r.hidden = 0 AND r.ended_at IS NULL
         AND r.starts_at <= ? AND (r.ends_at > ? OR r.spin_mode = 'elimination')`,
      kickUserId,
      now,
      now,
    );
    return rows.map((row) => Number(row.raffle_id));
  }

  private async joinRaffle(
    id: number,
    kickUserId: string,
  ): Promise<"joined" | "already" | "locked" | "closed"> {
    const now = Date.now();
    const entry = await this.db.run(
      `INSERT OR IGNORE INTO raffle_entries (raffle_id, kick_user_id, created_at)
       SELECT id, ?, ? FROM raffles
       WHERE id = ?
         AND hidden = 0
         AND ended_at IS NULL
         AND entries_locked = 0
         AND starts_at <= ?
         AND (end_mode = 'manual' OR ends_at > ?)`,
      kickUserId,
      now,
      id,
      now,
      now,
    );

    if (entry.changes > 0) return "joined";

    const existing = await this.db.first(
      `SELECT 1 AS x FROM raffle_entries e
       JOIN raffles r ON r.id = e.raffle_id
       WHERE e.raffle_id = ? AND e.kick_user_id = ?
         AND r.hidden = 0 AND r.ended_at IS NULL AND r.starts_at <= ?`,
      id,
      kickUserId,
      now,
    );
    if (existing) return "already";

    const lockedOpen = await this.db.first(
      `SELECT 1 AS x FROM raffles
       WHERE id = ? AND hidden = 0 AND ended_at IS NULL AND entries_locked = 1 AND starts_at <= ?`,
      id,
      now,
    );
    if (lockedOpen) return "locked";

    return "closed";
  }

  async handlePublicRaffles(): Promise<HttpResult> {
    const now = Date.now();
    await this.finalizeExpiredTimerRaffles(now);
    const rows = await this.db.all(
      `SELECT r.id, r.title, r.prize, r.note, r.winner, r.starts_at, r.ends_at, r.end_mode, r.ended_at,
              r.spin_mode, r.spin_speed, r.spin_duration_ms, r.exclude_prev_winner, r.entries_locked,
              (SELECT COUNT(*) FROM raffle_entries e WHERE e.raffle_id = r.id) AS entries,
              (SELECT COUNT(*) FROM raffle_entries e WHERE e.raffle_id = r.id AND e.eliminated_at IS NULL) AS active_entries,
              (SELECT COUNT(*) FROM raffle_entries e WHERE e.raffle_id = r.id AND e.eliminated_at IS NOT NULL) AS eliminated_entries
       FROM raffles r
       WHERE r.hidden = 0
         AND r.ended_at IS NULL
         AND r.starts_at <= ?
         AND (r.end_mode = 'manual' OR r.ends_at > ? OR r.spin_mode = 'elimination')
       ORDER BY CASE WHEN r.end_mode = 'manual' THEN 0 ELSE 1 END ASC, r.ends_at ASC, r.id ASC`,
      now,
      now,
    );

    const raffles = rows.map((r) => {
      const endMode: RaffleEndMode = r.end_mode === "manual" ? "manual" : "timer";
      const spinMode = normalizeSpinMode(r.spin_mode);
      const spinSpeed = normalizeSpinSpeed(r.spin_speed);
      const endsAt = Number(r.ends_at) || 0;
      const locked =
        Boolean(Number(r.entries_locked)) || (endMode === "timer" && endsAt <= now);
      return {
        ...r,
        end_mode: endMode,
        spin_mode: spinMode,
        spin_speed: spinSpeed,
        spin_duration_ms: normalizeSpinDurationMs(r.spin_duration_ms, spinSpeed),
        exclude_prev_winner: Boolean(Number(r.exclude_prev_winner ?? 1)),
        entries_locked: locked,
        entries: Number(r.entries) || 0,
        active_entries: Number(r.active_entries) || 0,
        eliminated_entries: Number(r.eliminated_entries) || 0,
        is_open: true,
      };
    });

    return jsonResponse({ raffles });
  }

  /** GET /api/raffles/:id -> single raffle + participant list + viewer status. */
  async handlePublicRaffleDetail(req: Request, idSeg: string): Promise<HttpResult> {
    const m = req.method.toUpperCase();
    if (m !== "GET" && m !== "HEAD") return methodNotAllowed(req.method);
    if (!ROUTE_ID_RE.test(idSeg)) return notFound("Raffle not found");
    const id = raffleId(idSeg);
    if (!id) return notFound("Raffle not found");

    const now = Date.now();
    await this.finalizeExpiredTimerRaffles(now);

    const row = await this.db.first(
      `SELECT id, title, prize, note, winner, starts_at, ends_at, end_mode, ended_at,
              spin_mode, spin_speed, spin_duration_ms, exclude_prev_winner, entries_locked,
              last_eliminated, last_spin_at, last_spin_kind,
              hidden, is_demo, updated_at
       FROM raffles
       WHERE id = ?`,
      id,
    );
    if (!row) return notFound("Raffle not found");

    if (Number(row.hidden) !== 0) {
      const gate = await this.access.requireStreamer(req);
      if (!gate.ok) return notFound("Raffle not found");
    }

    const viewerRoles = await this.access.resolveAccountRoles(req);
    const canManage = viewerRoles.isStreamer || viewerRoles.isAdmin;

    const endMode: RaffleEndMode = row.end_mode === "manual" ? "manual" : "timer";
    const spinMode = normalizeSpinMode(row.spin_mode);
    const spinSpeed = normalizeSpinSpeed(row.spin_speed);
    const spinDurationMs = normalizeSpinDurationMs(row.spin_duration_ms, spinSpeed);
    const startsAt = Number(row.starts_at) || 0;
    const endsAt = Number(row.ends_at) || 0;
    const endedAt = row.ended_at != null ? Number(row.ended_at) : null;
    const updatedAt = Number(row.updated_at) || 0;
    const entriesLocked =
      Boolean(Number(row.entries_locked)) ||
      (endMode === "timer" && endedAt == null && endsAt <= now);
    const isOpen =
      endedAt == null &&
      startsAt <= now &&
      (endMode === "manual" || endsAt > now || spinMode === "elimination");

    const winnerLower = String(row.winner || "").trim().toLowerCase();
    const winnerRows = await this.db.all<{
      id: number;
      kick_user_id: string | null;
      winner_name: string;
      created_at: number;
      kick_name: string | null;
      person_id: string | null;
      partner_username: string | null;
      ban_permanent: number | null;
      ban_until: number | null;
    }>(
      `SELECT w.id, w.kick_user_id, w.winner_name, w.created_at,
              ka.name AS kick_name, sp.id AS person_id,
              COALESCE(NULLIF(TRIM(sp.partner_username), ''), NULLIF(TRIM(ka.partner_username), '')) AS partner_username,
              rb.is_permanent AS ban_permanent,
              rb.banned_until AS ban_until
       FROM raffle_winners w
       LEFT JOIN kick_accounts ka ON ka.kick_user_id = w.kick_user_id
       LEFT JOIN site_people sp ON sp.kick_user_id = w.kick_user_id
       LEFT JOIN raffle_bans rb ON rb.kick_user_id = w.kick_user_id
       WHERE w.raffle_id = ?
       ORDER BY w.id ASC`,
      id,
    );

    const winnerNamesSet = new Set<string>();
    const winnerKickIdsSet = new Set<string>();
    if (winnerLower) winnerNamesSet.add(winnerLower);
    for (const w of winnerRows) {
      const wn = String(w.kick_name || w.winner_name || "").trim().toLowerCase();
      const wk = String(w.kick_user_id || "").trim().toLowerCase();
      if (wn) winnerNamesSet.add(wn);
      if (wk) winnerKickIdsSet.add(wk);
    }

    const entryRows = await this.db.all<{
      id: number;
      kick_user_id: string;
      created_at: number;
      eliminated_at: number | null;
      eliminated_order: number | null;
      kick_name: string | null;
      person_id: string | null;
      partner_username: string | null;
      ban_permanent: number | null;
      ban_until: number | null;
    }>(
      `SELECT e.id, e.kick_user_id, e.created_at, e.eliminated_at, e.eliminated_order,
              ka.name AS kick_name, sp.id AS person_id,
              COALESCE(NULLIF(TRIM(sp.partner_username), ''), NULLIF(TRIM(ka.partner_username), '')) AS partner_username,
              rb.is_permanent AS ban_permanent,
              rb.banned_until AS ban_until
       FROM raffle_entries e
       LEFT JOIN kick_accounts ka ON ka.kick_user_id = e.kick_user_id
       LEFT JOIN site_people sp ON sp.kick_user_id = e.kick_user_id
       LEFT JOIN raffle_bans rb ON rb.kick_user_id = e.kick_user_id
       WHERE e.raffle_id = ?
       ORDER BY e.created_at DESC, e.id DESC`,
      id,
    );

    const total = entryRows.length;
    let activeCount = 0;
    let eliminatedCount = 0;

    interface ParticipantMeta {
      name: string;
      avatar_url: string;
      ticket_no: number;
      kick_user_id: string;
      kick_name: string;
      partner_username: string | null;
      is_banned: boolean;
      banned_until: number | null;
    }

    const participantsByKickId = new Map<string, ParticipantMeta>();
    const participantsByName = new Map<string, ParticipantMeta>();

    const participants = entryRows.map((e, idx) => {
      const ticketNo = total - idx;
      const rawKickUserId = String(e.kick_user_id || "").trim();
      const rawKickName = String(e.kick_name || "").trim();
      const name = rawKickName || `Viewer #${ticketNo}`;
      const nameLower = name.toLowerCase();
      const kickIdLower = rawKickUserId.toLowerCase();
      const isEliminated = e.eliminated_at != null;
      if (isEliminated) {
        eliminatedCount += 1;
      } else {
        activeCount += 1;
      }
      const isWinner =
        winnerNamesSet.has(nameLower) ||
        (Boolean(kickIdLower) &&
          (winnerKickIdsSet.has(kickIdLower) || winnerNamesSet.has(kickIdLower)));
      const avatarUrl =
        (e.person_id || rawKickUserId.startsWith("demo-bot-")) && rawKickName
          ? buildLeaderboardAvatarUrl(rawKickName)
          : buildNeutralAvatarUrl();

      const partnerUsername = e.partner_username
        ? String(e.partner_username).trim() || null
        : null;
      const isBanned = Boolean(Number(e.ban_permanent));
      const rawBanUntil = e.ban_until != null ? Number(e.ban_until) : 0;
      const bannedUntil = !isBanned && rawBanUntil > now ? rawBanUntil : null;

      const meta: ParticipantMeta = {
        name,
        avatar_url: avatarUrl,
        ticket_no: ticketNo,
        kick_user_id: rawKickUserId,
        kick_name: rawKickName || name,
        partner_username: partnerUsername,
        is_banned: isBanned,
        banned_until: bannedUntil,
      };
      if (kickIdLower) {
        participantsByKickId.set(kickIdLower, meta);
      }
      participantsByName.set(nameLower, meta);

      return {
        id: Number(e.id),
        name,
        avatar_url: avatarUrl,
        joined_at: Number(e.created_at) || 0,
        ticket_no: ticketNo,
        is_winner: isWinner,
        is_eliminated: isEliminated,
        eliminated_at: e.eliminated_at != null ? Number(e.eliminated_at) : null,
        eliminated_order: e.eliminated_order != null ? Number(e.eliminated_order) : null,
        ...(canManage
          ? {
            kick_user_id: meta.kick_user_id,
            kick_name: meta.kick_name,
            partner_username: meta.partner_username,
            is_banned: meta.is_banned,
            banned_until: meta.banned_until,
          }
          : {}),
      };
    });

    const lookupModerationByName = async (
      lookupName: string,
    ): Promise<{
      kick_user_id: string;
      kick_name: string;
      partner_username: string | null;
      is_banned: boolean;
      banned_until: number | null;
    } | null> => {
      const clean = String(lookupName || "").trim();
      if (!clean) return null;
      const hit = await this.db.first<{
        kick_user_id: string;
        kick_name: string | null;
        partner_username: string | null;
        ban_permanent: number | null;
        ban_until: number | null;
      }>(
        `SELECT ka.kick_user_id, ka.name AS kick_name,
                COALESCE(NULLIF(TRIM(sp.partner_username), ''), NULLIF(TRIM(ka.partner_username), '')) AS partner_username,
                rb.is_permanent AS ban_permanent,
                rb.banned_until AS ban_until
         FROM kick_accounts ka
         LEFT JOIN site_people sp ON sp.kick_user_id = ka.kick_user_id
         LEFT JOIN raffle_bans rb ON rb.kick_user_id = ka.kick_user_id
         WHERE LOWER(ka.name) = LOWER(?)
         LIMIT 1`,
        clean,
      );
      if (!hit) return null;
      const perm = Boolean(Number(hit.ban_permanent));
      const until = hit.ban_until != null ? Number(hit.ban_until) : 0;
      return {
        kick_user_id: String(hit.kick_user_id || "").trim(),
        kick_name: String(hit.kick_name || clean).trim(),
        partner_username: hit.partner_username
          ? String(hit.partner_username).trim() || null
          : null,
        is_banned: perm,
        banned_until: !perm && until > now ? until : null,
      };
    };

    const matchedCurrentWinner = winnerLower
      ? participantsByName.get(winnerLower) || participantsByKickId.get(winnerLower)
      : undefined;
    const resolvedWinner = matchedCurrentWinner
      ? matchedCurrentWinner.name
      : row.winner
        ? String(row.winner)
        : null;

    const winners =
      winnerRows.length > 0
        ? await Promise.all(
          winnerRows.map(async (w, idx) => {
            const rawKickUserId = String(w.kick_user_id || "").trim();
            const rawKickName = String(w.kick_name || "").trim();
            const rawStoredName = String(w.winner_name || "").trim();
            const kickIdLower = rawKickUserId.toLowerCase();
            const matched =
              (kickIdLower ? participantsByKickId.get(kickIdLower) : undefined) ||
              (rawKickName ? participantsByName.get(rawKickName.toLowerCase()) : undefined) ||
              (rawStoredName ? participantsByName.get(rawStoredName.toLowerCase()) : undefined);
            const finalName =
              matched?.name || rawKickName || rawStoredName || `Winner #${idx + 1}`;
            const finalAvatar =
              matched?.avatar_url ||
              ((w.person_id || kickIdLower.startsWith("demo-bot-")) && rawKickName
                ? buildLeaderboardAvatarUrl(rawKickName)
                : buildNeutralAvatarUrl());

            let modFields: {
              kick_user_id: string;
              kick_name: string;
              partner_username: string | null;
              is_banned: boolean;
              banned_until: number | null;
            } | null = null;

            if (canManage) {
              if (matched) {
                modFields = {
                  kick_user_id: matched.kick_user_id,
                  kick_name: matched.kick_name,
                  partner_username: matched.partner_username,
                  is_banned: matched.is_banned,
                  banned_until: matched.banned_until,
                };
              } else if (rawKickUserId) {
                const perm = Boolean(Number(w.ban_permanent));
                const until = w.ban_until != null ? Number(w.ban_until) : 0;
                modFields = {
                  kick_user_id: rawKickUserId,
                  kick_name: rawKickName || finalName,
                  partner_username: w.partner_username
                    ? String(w.partner_username).trim() || null
                    : null,
                  is_banned: perm,
                  banned_until: !perm && until > now ? until : null,
                };
              } else {
                modFields = (await lookupModerationByName(
                  rawKickName || rawStoredName || finalName,
                )) || {
                  kick_user_id: "",
                  kick_name: rawKickName || rawStoredName || finalName,
                  partner_username: null,
                  is_banned: false,
                  banned_until: null,
                };
              }
            }

            return {
              id: Number(w.id),
              order: idx + 1,
              name: finalName,
              avatar_url: finalAvatar,
              ticket_no: matched?.ticket_no ?? 0,
              won_at: Number(w.created_at) || 0,
              ...(modFields || {}),
            };
          }),
        )
        : resolvedWinner
          ? [
            await (async () => {
              const modFields = canManage
                ? matchedCurrentWinner
                  ? {
                    kick_user_id: matchedCurrentWinner.kick_user_id,
                    kick_name: matchedCurrentWinner.kick_name,
                    partner_username: matchedCurrentWinner.partner_username,
                    is_banned: matchedCurrentWinner.is_banned,
                    banned_until: matchedCurrentWinner.banned_until,
                  }
                  : (await lookupModerationByName(resolvedWinner)) || {
                    kick_user_id: "",
                    kick_name: resolvedWinner,
                    partner_username: null,
                    is_banned: false,
                    banned_until: null,
                  }
                : null;
              return {
                id: -1,
                order: 1,
                name: resolvedWinner,
                avatar_url: matchedCurrentWinner?.avatar_url || buildNeutralAvatarUrl(),
                ticket_no: matchedCurrentWinner?.ticket_no ?? 0,
                won_at: endedAt || updatedAt || 0,
                ...(modFields || {}),
              };
            })(),
          ]
          : [];

    const person = await this.session.kickPerson(req);
    let viewerJoined = false;
    let viewerBan: { isPermanent: boolean; bannedUntil: number | null } | null = null;
    if (person?.kickUserId) {
      const hit = await this.db.first(
        `SELECT 1 AS x FROM raffle_entries WHERE raffle_id = ? AND kick_user_id = ?`,
        id,
        person.kickUserId,
      );
      viewerJoined = Boolean(hit);
      viewerBan = await this.getActiveRaffleBan(person.kickUserId, now);
    }

    const rawSpinKind = String(row.last_spin_kind || "").trim().toLowerCase();
    const lastSpinKind =
      rawSpinKind === "elimination"
        ? "elimination"
        : rawSpinKind === "winner"
          ? "winner"
          : null;

    return jsonResponse({
      raffle: {
        id: Number(row.id),
        title: String(row.title || ""),
        prize: String(row.prize || ""),
        note: row.note ? String(row.note) : null,
        winner: resolvedWinner,
        starts_at: startsAt,
        ends_at: endsAt,
        end_mode: endMode,
        ended_at: endedAt,
        spin_mode: spinMode,
        spin_speed: spinSpeed,
        spin_duration_ms: spinDurationMs,
        exclude_prev_winner: Boolean(Number(row.exclude_prev_winner ?? 1)),
        entries_locked: entriesLocked,
        last_eliminated: row.last_eliminated ? String(row.last_eliminated) : null,
        last_spin_at: row.last_spin_at != null ? Number(row.last_spin_at) : null,
        last_spin_kind: lastSpinKind,
        hidden: Boolean(Number(row.hidden)),
        is_demo: Boolean(Number(row.is_demo)),
        updated_at: updatedAt,
        entries: total,
        active_entries: activeCount,
        eliminated_entries: eliminatedCount,
        is_open: isOpen,
        winners,
      },
      winners,
      participants,
      viewer: {
        linked: Boolean(person),
        joined: viewerJoined,
        banned: Boolean(viewerBan?.isPermanent),
        banned_until: viewerBan && !viewerBan.isPermanent ? viewerBan.bannedUntil : null,
      },
    });
  }

  /** GET /api/raffles/mine -> raffles this Kick account already entered. */
  async handleMyRaffles(req: Request): Promise<HttpResult> {
    const m = req.method.toUpperCase();
    if (m !== "GET" && m !== "HEAD") return methodNotAllowed(req.method);

    const person = await this.session.kickPerson(req);
    if (!person) return jsonResponse({ linked: false, joined: [] });
    return jsonResponse({
      linked: true,
      joined: await this.joinedRaffleIds(person.kickUserId),
    });
  }

  /** POST /api/raffles/<id>/join -> enter the raffle. */
  async handleRaffleJoin(req: Request, idSeg: string): Promise<HttpResult> {
    if (!ROUTE_ID_RE.test(idSeg)) return notFound();
    if (req.method.toUpperCase() !== "POST") return methodNotAllowed(req.method);
    const csrf = verifyCsrf(req);
    if (!csrf.ok) return forbidden(csrf.error);
    if (!verifySameOrigin(req)) return forbidden("origin");

    const id = raffleId(idSeg);
    if (!id) return notFound("Raffle not found");

    const { person } = await this.session.loadPerson(req);
    if (!person || !person.emailVerified || !person.email) {
      return jsonResponse({ error: "register" }, 403);
    }
    if (!person.partnerUsername || !person.partnerUsername.trim()) {
      return jsonResponse({ error: "partner" }, 409);
    }
    if (!person.kickUserId || !person.name) {
      return unauthorized("kick");
    }

    const activeBan = await this.getActiveRaffleBan(person.kickUserId, Date.now());
    if (activeBan) {
      if (activeBan.isPermanent) {
        return jsonResponse({ error: "banned" }, 403);
      }
      return jsonResponse(
        { error: "timeout", banned_until: activeBan.bannedUntil },
        403,
      );
    }

    let result: "joined" | "already" | "locked" | "closed";
    try {
      result = await this.joinRaffle(id, person.kickUserId);
    } catch (err) {
      this.logger.error(`raffle join failed: ${(err as Error)?.message || err}`);
      return serverError("store");
    }
    if (result === "locked") return jsonResponse({ error: "locked" }, 409);
    if (result === "closed") return jsonResponse({ error: "closed" }, 409);

    return jsonResponse({
      ok: true,
      joined: true,
      already: result === "already",
    });
  }

  /** Streamer/Admin entry point under /api/raffles/manage/*. */
  async handleManageRaffles(req: Request, actor: Actor): Promise<HttpResult> {
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
    const path = cleanPath.replace(/^\/api\/raffles\/manage\/?/i, "");
    const segs = path ? path.split("/").filter(Boolean) : [];

    return this.handleAdminRaffles(req, segs, m, actor);
  }

  private async loadEntriesForDraw(id: number): Promise<EntryRowWithAccount[]> {
    return this.db.all<EntryRowWithAccount>(
      `SELECT e.id, e.kick_user_id, ka.name AS kick_name, sp.id AS person_id,
              e.eliminated_at, e.eliminated_order
       FROM raffle_entries e
       LEFT JOIN kick_accounts ka ON ka.kick_user_id = e.kick_user_id
       LEFT JOIN site_people sp ON sp.kick_user_id = e.kick_user_id
       WHERE e.raffle_id = ?
       ORDER BY e.id ASC`,
      id,
    );
  }

  private displayNameForEntry(entry: EntryRowWithAccount, indexOneBased: number): string {
    const clean = String(entry.kick_name || "").trim();
    if (clean) return clip(clean, WINNER_MAX);
    const rawId = String(entry.kick_user_id || "").trim();
    if (rawId) return clip(rawId, WINNER_MAX);
    return `Viewer #${indexOneBased}`;
  }

  async handleAdminRaffles(
    req: Request,
    segs: string[],
    method: string,
    actor: Actor,
  ): Promise<HttpResult> {
    if (segs.length === 0 && method === "GET") {
      const now = Date.now();
      await this.finalizeExpiredTimerRaffles(now);
      const raffles = await this.db.all(
        `SELECT r.*,
                (SELECT COUNT(*) FROM raffle_entries e WHERE e.raffle_id = r.id) AS entry_count,
                (SELECT COUNT(*) FROM raffle_entries e WHERE e.raffle_id = r.id AND e.eliminated_at IS NULL) AS active_entry_count,
                (SELECT COUNT(*) FROM raffle_entries e WHERE e.raffle_id = r.id AND e.eliminated_at IS NOT NULL) AS eliminated_entry_count
         FROM raffles r
         ORDER BY CASE WHEN r.ended_at IS NULL AND (r.end_mode = 'manual' OR r.ends_at > ? OR r.spin_mode = 'elimination') THEN 0 ELSE 1 END ASC,
                  r.created_at DESC, r.id DESC`,
        now,
      );
      return jsonResponse({ raffles });
    }

    if (segs.length === 0 && method === "POST") {
      const body = await readBody(req);
      if (!body) return badRequest("Invalid data");
      const fields = fieldsFrom(body, null);
      if ("error" in fields) return badRequest(fields.error);

      const now = Date.now();
      try {
        const res = await this.db.run(
          `INSERT INTO raffles (
            title, prize, note, winner, starts_at, ends_at, end_mode, ended_at,
            spin_mode, spin_speed, spin_duration_ms, exclude_prev_winner, entries_locked,
            hidden, is_demo, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          fields.title,
          fields.prize,
          fields.note,
          fields.winner,
          fields.startsAt,
          fields.endsAt,
          fields.endMode,
          fields.endedAt,
          fields.spinMode,
          fields.spinSpeed,
          fields.spinDurationMs,
          fields.excludePrevWinner,
          fields.entriesLocked,
          fields.hidden,
          fields.isDemo,
          now,
          now,
        );

        const id = res.lastRowId;
        if (fields.winner) {
          await this.appendRaffleWinner(Number(id), fields.winner, null, now);
        }
        await this.audit.audit(actor, "raffle.create", String(id), {
          title: fields.title,
          end_mode: fields.endMode,
          spin_mode: fields.spinMode,
        });
        return jsonResponse({ ok: true, id });
      } catch (e) {
        return badRequest(`Failed to create raffle: ${(e as Error).message}`);
      }
    }

    if (segs.length === 1 && segs[0] === "moderate-player" && method === "POST") {
      return this.handleModeratePlayer(req, null, actor);
    }

    const id = raffleId(segs[0]);
    if (!id) return notFound();

    const current = await this.db.first(`SELECT * FROM raffles WHERE id = ?`, id);
    if (!current) return notFound("Raffle not found");

    if (segs.length === 2 && segs[1] === "moderate-player" && method === "POST") {
      return this.handleModeratePlayer(req, id, actor);
    }

    if (segs.length === 1 && method === "GET") {
      const counts = await this.db.first<{
        total: number;
        active: number;
        eliminated: number;
      }>(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN eliminated_at IS NULL THEN 1 ELSE 0 END) AS active,
                SUM(CASE WHEN eliminated_at IS NOT NULL THEN 1 ELSE 0 END) AS eliminated
         FROM raffle_entries WHERE raffle_id = ?`,
        id,
      );
      return jsonResponse({
        raffle: {
          ...current,
          entry_count: Number(counts?.total) || 0,
          active_entry_count: Number(counts?.active) || 0,
          eliminated_entry_count: Number(counts?.eliminated) || 0,
        },
      });
    }

    if (segs.length === 2 && segs[1] === "entries" && method === "GET") {
      const now = Date.now();
      const rawEntries = await this.db.all<{
        id: number;
        raffle_id: number;
        kick_user_id: string;
        created_at: number;
        eliminated_at: number | null;
        eliminated_order: number | null;
        kick_name: string | null;
        person_id: string | null;
        email: string | null;
        email_verified_at: number | null;
        partner_username: string | null;
        ban_permanent: number | null;
        ban_until: number | null;
      }>(
        `SELECT e.id, e.raffle_id, e.kick_user_id, e.created_at,
                e.eliminated_at, e.eliminated_order,
                ka.name AS kick_name,
                sp.id AS person_id, sp.email, sp.email_verified_at,
                COALESCE(NULLIF(TRIM(sp.partner_username), ''), NULLIF(TRIM(ka.partner_username), '')) AS partner_username,
                rb.is_permanent AS ban_permanent,
                rb.banned_until AS ban_until
         FROM raffle_entries e
         LEFT JOIN kick_accounts ka ON ka.kick_user_id = e.kick_user_id
         LEFT JOIN site_people sp ON sp.kick_user_id = e.kick_user_id
         LEFT JOIN raffle_bans rb ON rb.kick_user_id = e.kick_user_id
         WHERE e.raffle_id = ?
         ORDER BY e.created_at DESC, e.id DESC`,
        id,
      );
      const entries = rawEntries.map((row) => {
        const cleanName = String(row.kick_name || "").trim();
        const isBanned = Boolean(Number(row.ban_permanent));
        const rawUntil = row.ban_until != null ? Number(row.ban_until) : 0;
        const bannedUntil = !isBanned && rawUntil > now ? rawUntil : null;
        return {
          ...row,
          partner_username: row.partner_username
            ? String(row.partner_username).trim() || null
            : null,
          is_banned: isBanned,
          banned_until: bannedUntil,
          is_eliminated: row.eliminated_at != null,
          avatar_url:
            (row.person_id || String(row.kick_user_id || "").startsWith("demo-bot-")) && cleanName
              ? buildLeaderboardAvatarUrl(cleanName)
              : buildNeutralAvatarUrl(),
        };
      });
      return jsonResponse({
        raffle: { ...current, entry_count: entries.length },
        entries,
      });
    }

    if (segs.length === 3 && segs[1] === "entries" && method === "DELETE") {
      const entryId = raffleId(segs[2]);
      if (!entryId) return notFound("Entry not found");
      const existing = await this.db.first(
        `SELECT e.id, e.kick_user_id, ka.name AS kick_name
         FROM raffle_entries e
         LEFT JOIN kick_accounts ka ON ka.kick_user_id = e.kick_user_id
         WHERE e.raffle_id = ? AND e.id = ?`,
        id,
        entryId,
      );
      if (!existing) return notFound("Entry not found");

      await this.db.batch([
        this.db.stmt(`DELETE FROM raffle_entries WHERE raffle_id = ? AND id = ?`, id, entryId),
        this.db.stmt(`UPDATE raffles SET updated_at = ? WHERE id = ?`, Date.now(), id),
      ]);
      await this.audit.audit(actor, "raffle.entry_remove", `${id}:${entryId}`, {
        kick_user_id: existing.kick_user_id,
        kick_name: existing.kick_name || null,
      });
      return jsonResponse({ ok: true });
    }

    if (
      segs.length === 4 &&
      segs[1] === "entries" &&
      segs[3] === "toggle-eliminate" &&
      method === "POST"
    ) {
      const entryId = raffleId(segs[2]);
      if (!entryId) return notFound("Entry not found");
      const existing = await this.db.first<{
        id: number;
        kick_user_id: string;
        kick_name: string | null;
        eliminated_at: number | null;
      }>(
        `SELECT e.id, e.kick_user_id, ka.name AS kick_name, e.eliminated_at
         FROM raffle_entries e
         LEFT JOIN kick_accounts ka ON ka.kick_user_id = e.kick_user_id
         WHERE e.raffle_id = ? AND e.id = ?`,
        id,
        entryId,
      );
      if (!existing) return notFound("Entry not found");

      const now = Date.now();
      const willEliminate = existing.eliminated_at == null;
      const entryName = String(existing.kick_name || existing.kick_user_id).trim();

      if (willEliminate) {
        const maxRow = await this.db.first<{ m: number | null }>(
          `SELECT MAX(eliminated_order) AS m FROM raffle_entries WHERE raffle_id = ?`,
          id,
        );
        const nextOrder = (Number(maxRow?.m) || 0) + 1;
        const clearWinner =
          current.winner &&
          String(current.winner).trim().toLowerCase() === entryName.toLowerCase();
        await this.db.batch([
          this.db.stmt(
            `UPDATE raffle_entries SET eliminated_at = ?, eliminated_order = ? WHERE raffle_id = ? AND id = ?`,
            now,
            nextOrder,
            id,
            entryId,
          ),
          clearWinner
            ? this.db.stmt(`UPDATE raffles SET winner = NULL, updated_at = ? WHERE id = ?`, now, id)
            : this.db.stmt(`UPDATE raffles SET updated_at = ? WHERE id = ?`, now, id),
        ]);
      } else {
        await this.db.batch([
          this.db.stmt(
            `UPDATE raffle_entries SET eliminated_at = NULL, eliminated_order = NULL WHERE raffle_id = ? AND id = ?`,
            id,
            entryId,
          ),
          this.db.stmt(`UPDATE raffles SET updated_at = ? WHERE id = ?`, now, id),
        ]);
      }

      await this.audit.audit(actor, "raffle.entry_toggle_eliminate", `${id}:${entryId}`, {
        eliminated: willEliminate,
        kick_name: entryName,
      });
      return jsonResponse({ ok: true, eliminated: willEliminate });
    }

    if (segs.length === 2 && segs[1] === "revive-last" && method === "POST") {
      const lastOut = await this.db.first<{
        id: number;
        kick_user_id: string;
        kick_name: string | null;
        eliminated_order: number | null;
      }>(
        `SELECT e.id, e.kick_user_id, ka.name AS kick_name, e.eliminated_order
         FROM raffle_entries e
         LEFT JOIN kick_accounts ka ON ka.kick_user_id = e.kick_user_id
         WHERE e.raffle_id = ? AND e.eliminated_at IS NOT NULL
         ORDER BY COALESCE(e.eliminated_order, 0) DESC, e.eliminated_at DESC, e.id DESC
         LIMIT 1`,
        id,
      );
      if (!lastOut) return badRequest("No eliminated entrants to revive");

      const now = Date.now();
      const revivedName = String(lastOut.kick_name || lastOut.kick_user_id).trim();
      const nextEndsAt =
        current.end_mode === "manual"
          ? MANUAL_OPEN_ENDS_AT
          : Number(current.ends_at) || now + 3_600_000;
      const nextLocked =
        current.end_mode !== "manual" && Number(current.ends_at) <= now
          ? 1
          : Number(current.entries_locked)
            ? 1
            : 0;

      const reviveStmts: BoundStatement[] = [];
      if (current.winner) {
        reviveStmts.push(
          this.db.stmt(
            `DELETE FROM raffle_winners
             WHERE id = (SELECT id FROM raffle_winners WHERE raffle_id = ? ORDER BY id DESC LIMIT 1)`,
            id,
          ),
        );
      }
      reviveStmts.push(
        this.db.stmt(
          `UPDATE raffle_entries SET eliminated_at = NULL, eliminated_order = NULL WHERE raffle_id = ? AND id = ?`,
          id,
          lastOut.id,
        ),
        this.db.stmt(
          `UPDATE raffles
           SET winner = NULL,
               ended_at = NULL,
               ends_at = ?,
               entries_locked = ?,
               last_eliminated = NULL,
               last_spin_kind = NULL,
               updated_at = ?
           WHERE id = ?`,
          nextEndsAt,
          nextLocked,
          now,
          id,
        ),
      );
      await this.db.batch(reviveStmts);

      await this.audit.audit(actor, "raffle.revive_last", String(id), {
        revived: revivedName,
      });
      return jsonResponse({ ok: true, id, revived: revivedName });
    }

    if (segs.length === 2 && segs[1] === "reset-winners" && method === "POST") {
      const now = Date.now();
      await this.db.batch([
        this.clearRaffleWinnersStmt(id),
        this.db.stmt(
          `UPDATE raffles
           SET winner = NULL,
               last_eliminated = NULL,
               last_spin_kind = NULL,
               last_spin_at = NULL,
               updated_at = ?
           WHERE id = ?`,
          now,
          id,
        ),
      ]);

      await this.audit.audit(actor, "raffle.reset_winners", String(id), {
        title: current.title,
      });
      return jsonResponse({ ok: true, id });
    }

    if (segs.length === 2 && segs[1] === "reset-eliminations" && method === "POST") {
      const body = (await readBody(req)) || {};
      const reopen = body.reopen !== undefined ? Boolean(asBool(body.reopen)) : true;
      const now = Date.now();
      const nextEndedAt = reopen
        ? null
        : current.ended_at != null
          ? Number(current.ended_at)
          : null;
      const nextEndsAt = reopen
        ? current.end_mode === "manual"
          ? MANUAL_OPEN_ENDS_AT
          : Number(current.ends_at) > now
            ? Number(current.ends_at)
            : now + 3_600_000
        : Number(current.ends_at) || now;
      const nextLocked = reopen ? 0 : Number(current.entries_locked) ? 1 : 0;

      await this.db.batch([
        this.db.stmt(
          `UPDATE raffle_entries SET eliminated_at = NULL, eliminated_order = NULL WHERE raffle_id = ?`,
          id,
        ),
        this.db.stmt(
          `UPDATE raffles
           SET winner = NULL,
               ended_at = ?,
               ends_at = ?,
               entries_locked = ?,
               last_eliminated = NULL,
               last_spin_kind = NULL,
               last_spin_at = NULL,
               updated_at = ?
           WHERE id = ?`,
          nextEndedAt,
          nextEndsAt,
          nextLocked,
          now,
          id,
        ),
      ]);

      await this.audit.audit(actor, "raffle.reset_eliminations", String(id), { reopen });
      return jsonResponse({ ok: true, id });
    }

    if (segs.length === 2 && segs[1] === "reopen" && method === "POST") {
      const body = (await readBody(req)) || {};
      const clearWinner = body.clear_winner !== undefined ? Boolean(asBool(body.clear_winner)) : true;
      const unlockEntries =
        body.unlock_entries !== undefined ? Boolean(asBool(body.unlock_entries)) : true;
      const now = Date.now();
      const nextEndsAt =
        current.end_mode === "manual"
          ? MANUAL_OPEN_ENDS_AT
          : Number(current.ends_at) > now
            ? Number(current.ends_at)
            : now + 3_600_000;
      const nextWinner = clearWinner ? null : current.winner ? String(current.winner) : null;
      const nextLocked = unlockEntries ? 0 : Number(current.entries_locked) ? 1 : 0;

      const reopenStmts: BoundStatement[] = [];
      if (clearWinner) {
        reopenStmts.push(this.clearRaffleWinnersStmt(id));
      }
      reopenStmts.push(
        this.db.stmt(
          `UPDATE raffles
           SET winner = ?,
               ended_at = NULL,
               ends_at = ?,
               entries_locked = ?,
               last_eliminated = CASE WHEN ? = 1 THEN NULL ELSE last_eliminated END,
               last_spin_kind = CASE WHEN ? = 1 THEN NULL ELSE last_spin_kind END,
               updated_at = ?
           WHERE id = ?`,
          nextWinner,
          nextEndsAt,
          nextLocked,
          clearWinner ? 1 : 0,
          clearWinner ? 1 : 0,
          now,
          id,
        ),
      );
      await this.db.batch(reopenStmts);

      await this.audit.audit(actor, "raffle.reopen", String(id), {
        clear_winner: clearWinner,
        unlock_entries: unlockEntries,
      });
      return jsonResponse({ ok: true, id });
    }

    if (segs.length === 2 && (segs[1] === "end" || segs[1] === "finish") && method === "POST") {
      return this.handleEndRaffle(id, current, actor);
    }

    if (
      segs.length === 2 &&
      (segs[1] === "spin" || segs[1] === "draw-winner") &&
      method === "POST"
    ) {
      return this.handleSpinAction(req, id, current, segs[1], actor);
    }

    if (segs.length !== 1) return notFound();

    if (method === "PATCH") {
      const body = await readBody(req);
      if (!body) return badRequest("Invalid data");
      const fields = fieldsFrom(body, current);
      if ("error" in fields) return badRequest(fields.error);

      const now = Date.now();
      const prevWinner = String(current.winner || "").trim();
      const patchStmts: BoundStatement[] = [];
      if (fields.clearSpinMeta && !fields.winner) {
        patchStmts.push(this.clearRaffleWinnersStmt(id));
      } else if (
        body.winner !== undefined &&
        fields.winner &&
        fields.winner.toLowerCase() !== prevWinner.toLowerCase()
      ) {
        const wStmt = this.appendRaffleWinnerStmt(id, fields.winner, null, now);
        if (wStmt) patchStmts.push(wStmt);
      }
      patchStmts.push(
        this.db.stmt(
          `UPDATE raffles SET
            title = ?, prize = ?, note = ?, winner = ?, starts_at = ?, ends_at = ?,
            end_mode = ?, ended_at = ?, spin_mode = ?, spin_speed = ?, spin_duration_ms = ?,
            exclude_prev_winner = ?, entries_locked = ?, hidden = ?, is_demo = ?,
            last_eliminated = CASE WHEN ? = 1 THEN NULL ELSE last_eliminated END,
            last_spin_kind = CASE WHEN ? = 1 THEN NULL ELSE last_spin_kind END,
            updated_at = ?
           WHERE id = ?`,
          fields.title,
          fields.prize,
          fields.note,
          fields.winner,
          fields.startsAt,
          fields.endsAt,
          fields.endMode,
          fields.endedAt,
          fields.spinMode,
          fields.spinSpeed,
          fields.spinDurationMs,
          fields.excludePrevWinner,
          fields.entriesLocked,
          fields.hidden,
          fields.isDemo,
          fields.clearSpinMeta ? 1 : 0,
          fields.clearSpinMeta ? 1 : 0,
          now,
          id,
        ),
      );
      await this.db.batch(patchStmts);

      await this.audit.audit(actor, "raffle.update", String(id), {
        title: fields.title,
        end_mode: fields.endMode,
        spin_mode: fields.spinMode,
        entries_locked: Boolean(fields.entriesLocked),
        hidden: Boolean(fields.hidden),
      });
      return jsonResponse({ ok: true, id });
    }

    if (method === "DELETE") {
      await this.db.batch([
        this.db.stmt(`DELETE FROM raffle_winners WHERE raffle_id = ?`, id),
        this.db.stmt(`DELETE FROM raffle_entries WHERE raffle_id = ?`, id),
        this.db.stmt(`DELETE FROM raffles WHERE id = ?`, id),
      ]);
      await this.audit.audit(actor, "raffle.delete", String(id), { title: current.title });
      return jsonResponse({ ok: true });
    }

    return notFound();
  }

  private async handleEndRaffle(id: number, current: Row, actor: Actor): Promise<HttpResult> {
    const now = Date.now();
    const nextEndedAt = current.ended_at != null ? Number(current.ended_at) : now;
    const nextEndsAt = Math.min(Number(current.ends_at) || now, now);
    const keepWinner = current.winner ? String(current.winner) : null;
    const countRow = await this.db.first<{ c: number }>(
      `SELECT COUNT(*) AS c FROM raffle_entries WHERE raffle_id = ?`,
      id,
    );
    const entryCount = Number(countRow?.c) || 0;

    await this.db.run(
      `UPDATE raffles
       SET ended_at = ?,
           ends_at = ?,
           entries_locked = 1,
           updated_at = ?
       WHERE id = ?`,
      nextEndedAt,
      nextEndsAt,
      now,
      id,
    );

    await this.audit.audit(actor, "raffle.end", String(id), {
      title: current.title,
      winner: keepWinner,
      entry_count: entryCount,
    });

    return jsonResponse({
      ok: true,
      id,
      mode: "end",
      winner: keepWinner,
      entry_count: entryCount,
      ended_at: nextEndedAt,
    });
  }

  private async handleSpinAction(
    req: Request,
    id: number,
    current: Row,
    actionSeg: string,
    actor: Actor,
  ): Promise<HttpResult> {
    const body = (await readBody(req)) || {};
    const now = Date.now();

    let nextSpeed: RaffleSpinSpeed =
      body.spin_speed !== undefined
        ? normalizeSpinSpeed(body.spin_speed)
        : normalizeSpinSpeed(current.spin_speed);
    const nextDurationMs: number =
      body.spin_duration_ms !== undefined
        ? normalizeSpinDurationMs(body.spin_duration_ms, nextSpeed)
        : normalizeSpinDurationMs(current.spin_duration_ms, nextSpeed);
    if (body.spin_duration_ms !== undefined) {
      nextSpeed = nextDurationMs === 0 ? "instant" : nextDurationMs <= 2200 ? "fast" : "normal";
    }

    let requestedMode: "winner" | "elimination" | "reroll";
    if (actionSeg === "draw-winner") {
      requestedMode = current.winner ? "reroll" : "winner";
    } else {
      const raw = asTrimmed(body.mode).toLowerCase();
      if (raw === "end" || raw === "finish") {
        return this.handleEndRaffle(id, current, actor);
      }
      if (raw === "elimination" || raw === "winner" || raw === "reroll") {
        requestedMode = raw;
      } else if (current.winner) {
        requestedMode = "reroll";
      } else {
        requestedMode = normalizeSpinMode(current.spin_mode);
      }
    }

    const keepEndedAt = current.ended_at != null ? Number(current.ended_at) : null;
    const keepEndsAt = Number(current.ends_at) || (keepEndedAt ?? MANUAL_OPEN_ENDS_AT);
    const keepLocked = keepEndedAt != null || Number(current.entries_locked) ? 1 : 0;

    let allEntries = await this.loadEntriesForDraw(id);

    if (requestedMode === "elimination") {
      if (!allEntries.length) {
        return badRequest("No entrants in this raffle yet");
      }

      const autoReset = asBool(body.auto_reset_if_done) === true;
      let activeEntries = allEntries.filter((e) => e.eliminated_at == null);

      if (activeEntries.length <= 1 && allEntries.length > 1 && autoReset) {
        await this.db.run(
          `UPDATE raffle_entries SET eliminated_at = NULL, eliminated_order = NULL WHERE raffle_id = ?`,
          id,
        );
        allEntries = await this.loadEntriesForDraw(id);
        activeEntries = allEntries;
      }

      if (activeEntries.length === 1 && !current.winner) {
        const only = activeEntries[0];
        const idx = allEntries.findIndex((x) => x.id === only.id);
        const winnerName = this.displayNameForEntry(only, idx + 1);
        const singleStmts: BoundStatement[] = [
          this.db.stmt(
            `UPDATE raffles
             SET winner = ?, ended_at = ?, ends_at = ?, entries_locked = ?,
                 spin_mode = 'elimination', spin_speed = ?, spin_duration_ms = ?,
                 last_eliminated = NULL, last_spin_kind = 'winner', last_spin_at = ?, updated_at = ?
             WHERE id = ?`,
            winnerName,
            keepEndedAt,
            keepEndsAt,
            keepLocked,
            nextSpeed,
            nextDurationMs,
            now,
            now,
            id,
          ),
        ];
        const singleWStmt = this.appendRaffleWinnerStmt(id, winnerName, only.kick_user_id, now);
        if (singleWStmt) singleStmts.push(singleWStmt);
        await this.db.batch(singleStmts);
        await this.audit.audit(actor, "raffle.spin_elimination", String(id), {
          winner: winnerName,
          remaining_count: 1,
        });
        return jsonResponse({
          ok: true,
          id,
          mode: "elimination",
          eliminated: [],
          last_eliminated: null,
          remaining_count: 1,
          winner: winnerName,
          ended_at: keepEndedAt,
          last_spin_at: now,
        });
      }

      if (activeEntries.length <= 1) {
        return badRequest(
          "Only 1 player left. Click Reset to restore all players back to the roulette.",
        );
      }

      const rawCount = body.count !== undefined ? asInt(body.count) : 1;
      const elimCount = Math.max(1, Math.min(5, rawCount || 1, activeEntries.length - 1));
      const pickedOut = pickRandomSubset(activeEntries, elimCount);
      const pickedIds = new Set(pickedOut.map((p) => p.id));
      const survivors = activeEntries.filter((e) => !pickedIds.has(e.id));

      const eliminatedNames = pickedOut.map((e) => {
        const idx = allEntries.findIndex((x) => x.id === e.id);
        return this.displayNameForEntry(e, idx + 1);
      });
      const lastEliminatedName = eliminatedNames[eliminatedNames.length - 1] || null;

      let crownedWinner: string | null = null;
      if (survivors.length === 1) {
        const surv = survivors[0];
        const idx = allEntries.findIndex((x) => x.id === surv.id);
        crownedWinner = this.displayNameForEntry(surv, idx + 1);
      }

      const maxRow = await this.db.first<{ m: number | null }>(
        `SELECT MAX(eliminated_order) AS m FROM raffle_entries WHERE raffle_id = ?`,
        id,
      );
      let orderCursor = Number(maxRow?.m) || 0;
      const elimStmts: BoundStatement[] = [];
      for (const outEntry of pickedOut) {
        orderCursor += 1;
        elimStmts.push(
          this.db.stmt(
            `UPDATE raffle_entries SET eliminated_at = ?, eliminated_order = ? WHERE raffle_id = ? AND id = ?`,
            now,
            orderCursor,
            id,
            outEntry.id,
          ),
        );
      }
      elimStmts.push(
        this.db.stmt(
          `UPDATE raffles
           SET winner = ?,
               ended_at = ?,
               ends_at = ?,
               entries_locked = ?,
               spin_mode = 'elimination',
               spin_speed = ?,
               spin_duration_ms = ?,
               last_eliminated = ?,
               last_spin_kind = 'elimination',
               last_spin_at = ?,
               updated_at = ?
           WHERE id = ?`,
          crownedWinner,
          keepEndedAt,
          keepEndsAt,
          keepLocked,
          nextSpeed,
          nextDurationMs,
          lastEliminatedName,
          now,
          now,
          id,
        ),
      );
      if (crownedWinner && survivors[0]) {
        const wStmt = this.appendRaffleWinnerStmt(id, crownedWinner, survivors[0].kick_user_id, now);
        if (wStmt) elimStmts.push(wStmt);
      }
      await this.db.batch(elimStmts);

      await this.audit.audit(actor, "raffle.spin_elimination", String(id), {
        title: current.title,
        eliminated: eliminatedNames,
        remaining_count: survivors.length,
        winner: crownedWinner,
      });

      return jsonResponse({
        ok: true,
        id,
        mode: "elimination",
        eliminated: eliminatedNames,
        last_eliminated: lastEliminatedName,
        remaining_count: survivors.length,
        winner: crownedWinner,
        entry_count: allEntries.length,
        ended_at: keepEndedAt,
        last_spin_at: now,
      });
    }

    // Winner / Reroll spin modes (never end the raffle; only End Raffle sets ended_at)
    if (!allEntries.length) {
      return badRequest("No entrants in this raffle yet");
    }

    const activeEntries = allEntries.filter((e) => e.eliminated_at == null);
    // If rerolling after an elimination raffle already narrowed down to <=1 survivor,
    // allow drawing from the full entrant pool so a genuine reroll is always possible.
    let basePool =
      activeEntries.length >= 2 || (!current.winner && activeEntries.length === 1)
        ? activeEntries
        : allEntries;

    const shouldExcludeCurrent =
      body.exclude_current !== undefined
        ? Boolean(asBool(body.exclude_current))
        : Boolean(Number(current.exclude_prev_winner ?? 1));

    const curWinnerLower = String(current.winner || "").trim().toLowerCase();
    if (shouldExcludeCurrent && basePool.length > 1) {
      const priorRows = await this.db.all<{ kick_user_id: string | null; winner_name: string }>(
        `SELECT kick_user_id, winner_name FROM raffle_winners WHERE raffle_id = ?`,
        id,
      );
      const prevNames = new Set<string>();
      const prevKickIds = new Set<string>();
      if (curWinnerLower) prevNames.add(curWinnerLower);
      for (const pr of priorRows) {
        const wn = String(pr.winner_name || "").trim().toLowerCase();
        const wk = String(pr.kick_user_id || "").trim().toLowerCase();
        if (wn) prevNames.add(wn);
        if (wk) prevKickIds.add(wk);
      }

      if (prevNames.size > 0 || prevKickIds.size > 0) {
        const filteredAll = basePool.filter((row, idx) => {
          const nameLower = this.displayNameForEntry(row, idx + 1).toLowerCase();
          const idLower = String(row.kick_user_id || "").trim().toLowerCase();
          return (
            !prevNames.has(nameLower) &&
            !(idLower && (prevKickIds.has(idLower) || prevNames.has(idLower)))
          );
        });
        if (filteredAll.length > 0) {
          basePool = filteredAll;
        } else if (curWinnerLower) {
          const filteredLast = basePool.filter((row, idx) => {
            const nameLower = this.displayNameForEntry(row, idx + 1).toLowerCase();
            const idLower = String(row.kick_user_id || "").trim().toLowerCase();
            return nameLower !== curWinnerLower && idLower !== curWinnerLower;
          });
          if (filteredLast.length > 0) {
            basePool = filteredLast;
          }
        }
      }
    }

    const picked = basePool[secureRandomIndex(basePool.length)];
    const pickedGlobalIdx = allEntries.findIndex((e) => e.id === picked.id);
    const winnerName = this.displayNameForEntry(picked, pickedGlobalIdx + 1);

    const drawStmts: BoundStatement[] = [];
    if (picked.eliminated_at != null) {
      drawStmts.push(
        this.db.stmt(
          `UPDATE raffle_entries SET eliminated_at = NULL, eliminated_order = NULL WHERE raffle_id = ? AND id = ?`,
          id,
          picked.id,
        ),
      );
    }
    drawStmts.push(
      this.db.stmt(
        `UPDATE raffles
         SET winner = ?,
             ended_at = ?,
             ends_at = ?,
             entries_locked = ?,
             spin_speed = ?,
             spin_duration_ms = ?,
             last_eliminated = NULL,
             last_spin_kind = 'winner',
             last_spin_at = ?,
             updated_at = ?
         WHERE id = ?`,
        winnerName,
        keepEndedAt,
        keepEndsAt,
        keepLocked,
        nextSpeed,
        nextDurationMs,
        now,
        now,
        id,
      ),
    );
    const drawWStmt = this.appendRaffleWinnerStmt(id, winnerName, picked.kick_user_id, now);
    if (drawWStmt) drawStmts.push(drawWStmt);
    await this.db.batch(drawStmts);

    const auditAction = requestedMode === "reroll" ? "raffle.reroll" : "raffle.draw_winner";

    await this.audit.audit(actor, auditAction, String(id), {
      title: current.title,
      winner: winnerName,
      previous_winner: current.winner || null,
      kick_user_id: picked.kick_user_id,
      entry_count: allEntries.length,
    });

    const candidates = basePool
      .slice(0, 30)
      .map((r, i) => this.displayNameForEntry(r, i + 1));

    const cleanPickedName = String(picked.kick_name || "").trim();
    const pickedAvatarUrl =
      (picked.person_id || String(picked.kick_user_id || "").startsWith("demo-bot-")) &&
        cleanPickedName
        ? buildLeaderboardAvatarUrl(cleanPickedName)
        : buildNeutralAvatarUrl();

    return jsonResponse({
      ok: true,
      id,
      mode: requestedMode,
      winner: winnerName,
      kick_user_id: picked.kick_user_id,
      avatar_url: pickedAvatarUrl,
      entry_count: allEntries.length,
      active_count: activeEntries.length,
      candidates,
      ended_at: keepEndedAt,
      last_spin_at: now,
    });
  }

  private async handleModeratePlayer(
    req: Request,
    contextRaffleId: number | null,
    actor: Actor,
  ): Promise<HttpResult> {
    const body = await readBody(req);
    if (!body) return badRequest("Invalid data");

    const action = asTrimmed(body.action).toLowerCase();
    if (action !== "timeout" && action !== "ban" && action !== "unban") {
      return badRequest("Invalid moderation action");
    }

    let kickUserId = clip(body.kick_user_id, 120);
    const rawKickName = clip(body.kick_name, WINNER_MAX);

    if (!kickUserId && rawKickName) {
      const byAccount = await this.db.first<{ kick_user_id: string }>(
        `SELECT kick_user_id FROM kick_accounts WHERE LOWER(name) = LOWER(?) LIMIT 1`,
        rawKickName,
      );
      if (byAccount?.kick_user_id) {
        kickUserId = String(byAccount.kick_user_id).trim();
      } else if (contextRaffleId != null) {
        const byWinner = await this.db.first<{ kick_user_id: string }>(
          `SELECT kick_user_id FROM raffle_winners
           WHERE raffle_id = ? AND LOWER(winner_name) = LOWER(?) AND kick_user_id IS NOT NULL
           LIMIT 1`,
          contextRaffleId,
          rawKickName,
        );
        if (byWinner?.kick_user_id) {
          kickUserId = String(byWinner.kick_user_id).trim();
        }
      }
    }

    if (!kickUserId) {
      return badRequest("Player Kick account could not be resolved");
    }

    const targetRow = await this.db.first<{
      kick_user_id: string;
      kick_name: string | null;
      partner_username: string | null;
      person_role: string | null;
      known: number;
    }>(
      `SELECT
         ? AS kick_user_id,
         ka.name AS kick_name,
         COALESCE(NULLIF(TRIM(sp.partner_username), ''), NULLIF(TRIM(ka.partner_username), '')) AS partner_username,
         sp.role AS person_role,
         (CASE
           WHEN ka.kick_user_id IS NOT NULL
             OR sp.id IS NOT NULL
             OR rb.kick_user_id IS NOT NULL
             OR EXISTS (SELECT 1 FROM raffle_entries WHERE kick_user_id = ?)
             OR EXISTS (SELECT 1 FROM raffle_winners WHERE kick_user_id = ?)
           THEN 1 ELSE 0 END) AS known
       FROM (SELECT 1)
       LEFT JOIN kick_accounts ka ON ka.kick_user_id = ?
       LEFT JOIN site_people sp ON sp.kick_user_id = ?
       LEFT JOIN raffle_bans rb ON rb.kick_user_id = ?`,
      kickUserId,
      kickUserId,
      kickUserId,
      kickUserId,
      kickUserId,
      kickUserId,
    );

    if (!targetRow || !Number(targetRow.known)) {
      return notFound("Player not found");
    }

    if (String(targetRow.person_role || "").toLowerCase() === "admin" && action !== "unban") {
      const adminGate = await this.access.requireAdmin(req);
      if (!adminGate.ok) {
        return forbidden("Streamers cannot ban or restrict an administrator");
      }
    }

    const now = Date.now();
    const reason = optionalText(body.reason, 200);
    const actorEmail = actor?.email ? String(actor.email).slice(0, 200) : null;
    const resolvedKickName = String(targetRow.kick_name || rawKickName || kickUserId).trim();
    const resolvedPartner = targetRow.partner_username
      ? String(targetRow.partner_username).trim() || null
      : null;

    if (action === "unban") {
      await this.db.run(`DELETE FROM raffle_bans WHERE kick_user_id = ?`, kickUserId);
      await this.audit.audit(actor, "raffle.player_unban", kickUserId, {
        kick_name: resolvedKickName,
        raffle_id: contextRaffleId,
      });
      return jsonResponse({
        ok: true,
        kick_user_id: kickUserId,
        kick_name: resolvedKickName,
        partner_username: resolvedPartner,
        is_banned: false,
        banned_until: null,
        removed_entries: 0,
      });
    }

    let durationMinutes = 5;
    let bannedUntil: number | null = null;
    if (action === "timeout") {
      const parsedMin = body.duration_minutes !== undefined ? asInt(body.duration_minutes) : 5;
      if (parsedMin == null || parsedMin < 1 || parsedMin > 43_200) {
        return badRequest("Timeout duration must be between 1 and 43200 minutes");
      }
      durationMinutes = parsedMin;
      bannedUntil = now + durationMinutes * 60_000;
    }

    const isPermanent = action === "ban" ? 1 : 0;
    let removedEntries = 0;

    const openRaffles = await this.db.all<{ raffle_id: number }>(
      `SELECT DISTINCT e.raffle_id
       FROM raffle_entries e
       JOIN raffles r ON r.id = e.raffle_id
       WHERE e.kick_user_id = ? AND r.ended_at IS NULL`,
      kickUserId,
    );

    const modStmts: BoundStatement[] = [
      this.db.stmt(
        `INSERT INTO raffle_bans (
           kick_user_id, is_permanent, banned_until, reason, actor_email, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(kick_user_id) DO UPDATE SET
           is_permanent = excluded.is_permanent,
           banned_until = excluded.banned_until,
           reason = COALESCE(excluded.reason, raffle_bans.reason),
           actor_email = excluded.actor_email,
           updated_at = excluded.updated_at`,
        kickUserId,
        isPermanent,
        bannedUntil,
        reason,
        actorEmail,
        now,
        now,
      ),
    ];

    if (openRaffles.length > 0) {
      modStmts.push(
        this.db.stmt(
          `DELETE FROM raffle_entries
           WHERE kick_user_id = ?
             AND raffle_id IN (SELECT id FROM raffles WHERE ended_at IS NULL)`,
          kickUserId,
        ),
      );
      for (const item of openRaffles) {
        modStmts.push(
          this.db.stmt(`UPDATE raffles SET updated_at = ? WHERE id = ?`, now, Number(item.raffle_id)),
        );
      }
    }

    const modResults = await this.db.batch(modStmts);
    if (openRaffles.length > 0) {
      removedEntries = modResults[1]?.changes ?? 0;
    }

    await this.audit.audit(
      actor,
      action === "ban" ? "raffle.player_ban" : "raffle.player_timeout",
      kickUserId,
      {
        kick_name: resolvedKickName,
        raffle_id: contextRaffleId,
        duration_minutes: action === "timeout" ? durationMinutes : null,
        banned_until: bannedUntil,
        removed_entries: removedEntries,
      },
    );

    return jsonResponse({
      ok: true,
      kick_user_id: kickUserId,
      kick_name: resolvedKickName,
      partner_username: resolvedPartner,
      is_banned: action === "ban",
      banned_until: bannedUntil,
      removed_entries: removedEntries,
    });
  }
}
