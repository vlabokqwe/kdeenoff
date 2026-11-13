/** Types and formatting helpers for the interactive Admin Dashboard overlay. */

export interface AdminBoard {
  id: number;
  slug: string;
  title: string;
  subtitle?: string | null;
  partner?: string | null;
  partner_signup_url?: string | null;
  prize_pool_cents?: number | null;
  starts_at?: number | null;
  ends_at?: number | null;
  hidden?: number | null;
  archived?: number | null;
  player_count?: number | null;
  total_wagered_cents?: number | null;
  spot_prize_total_cents?: number | null;
  avatar_style?: string | null;
  auto_hidden_above_rank?: number | null;
  auto_rank_by_wagered?: number | null;
  auto_wager_growth_enabled?: number | null;
  auto_wager_growth_pct?: number | null;
  auto_wager_growth_interval_ms?: number | null;
  badge?: string | null;
  promo_code?: string | null;
  sort_order?: number | null;
  show_in_drawer?: number | null;
  show_on_home?: number | null;
  is_demo?: number | null;
}

export interface AdminPlayer {
  id: number;
  board_id?: number;
  username: string;
  rank?: number | null;
  sort_order?: number | null;
  avatar_url?: string | null;
  avatar_sid?: string | null;
  is_registered?: number | null;
  wagered_cents: number;
  prize_cents: number;
  wag_growth_enabled?: number | null;
  wag_growth_pct?: number | null;
  wag_growth_hours?: number | null;
  wag_growth_last_at?: number | null;
}

export interface AdminSpot {
  rank: number;
  prize_cents: number;
  hidden?: number | null;
}

export interface AdminBoardDetail {
  board: AdminBoard;
  players: AdminPlayer[];
  spots: AdminSpot[];
}

export interface AdminRaffle {
  id: number;
  title: string;
  prize?: string | null;
  winner?: string | null;
  note?: string | null;
  starts_at?: number | null;
  ends_at?: number | null;
  end_mode?: "timer" | "manual" | null;
  ended_at?: number | null;
  hidden?: number | boolean | null;
  is_demo?: number | boolean | null;
  entry_count?: number | null;
  created_at?: number | null;
  updated_at?: number | null;
}

export interface AdminRaffleEntry {
  id: number;
  raffle_id: number;
  kick_user_id: string;
  created_at: number;
  kick_name?: string | null;
  avatar_url?: string | null;
  person_id?: string | null;
  email?: string | null;
  email_verified_at?: number | null;
}

export interface AdminUser {
  id: string;
  person_id: string | null;
  email: string;
  email_verified: boolean;
  email_verified_at: number | null;
  kick_user_id: string;
  kick_name: string;
  role?: "player" | "streamer" | "admin";
  avatar_url: string;
  active_sessions: number;
  raffle_entries_count: number;
  raffles_won_count: number;
  created_at: number;
  updated_at: number;
}

export interface AdminUserSession {
  created_at: number;
  expires_at: number;
}

export interface AdminUserRaffleEntry {
  id: number;
  raffle_id: number;
  created_at: number;
  title?: string | null;
  prize?: string | null;
  winner?: string | null;
  starts_at?: number | null;
  ends_at?: number | null;
  hidden?: number | null;
}

export interface AdminUserDetail {
  user: {
    id: string;
    person_id: string | null;
    email: string;
    email_verified: boolean;
    email_verified_at: number | null;
    kick_user_id: string;
    kick_name: string;
    role?: "player" | "streamer" | "admin";
    avatar_url: string;
    created_at: number;
    updated_at: number;
  };
  entries: AdminUserRaffleEntry[];
  sessions: AdminUserSession[];
}

export interface AdminAuditEntry {
  id?: number;
  at?: number | null;
  actor_email?: string | null;
  action?: string | null;
  target?: string | null;
  meta_json?: string | null;
}

export interface ActivityDayPoint {
  date: string;
  label: string;
  entries: number;
  users: number;
  audits: number;
}

export interface OverviewTopPlayer {
  id: number;
  username: string;
  rank: number | null;
  wagered_cents: number;
  prize_cents: number;
  avatar_url: string;
  wag_growth_enabled: boolean;
  board_slug: string;
  board_title: string;
}

export interface AdminOverviewData {
  actor: { sub: number; email: string };
  kpis: {
    activeBoards: number;
    totalBoards: number;
    endedBoards: number;
    archivedBoards: number;
    hiddenBoards: number;
    demoBoards?: number;
    demoRaffles?: number;
    totalPlayers: number;
    activePlayers: number;
    growthEnabledPlayers: number;
    activePrizePoolCents: number;
    totalWageredActiveCents: number;
    totalWageredAllCents: number;
    liveRaffles: number;
    upcomingRaffles: number;
    finishedRaffles: number;
    awaitingWinnerRaffles: number;
    totalRaffleEntries: number;
    totalUsers: number;
    verifiedEmails: number;
    linkedKickUsers: number;
    activeSessions: number;
    auditLast24h: number;
    auditTotal: number;
  };
  boardBreakdown: AdminBoard[];
  topPlayers: OverviewTopPlayer[];
  activitySeries: ActivityDayPoint[];
  recentAudit: AdminAuditEntry[];
}

export type SiteSettingsMap = Record<string, string>;

export type ToastKind = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  text: string;
  kind: ToastKind;
}

const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const shortDateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function fmtDateTime(ms: number | null | undefined): string {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return dateTimeFmt.format(n);
}

export function fmtShortDate(ms: number | null | undefined): string {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return shortDateFmt.format(n);
}

export function relTime(ms: number | null | undefined, now = Date.now()): string {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const diff = now - n;
  const abs = Math.abs(diff);
  const sec = Math.floor(abs / 1000);
  if (sec < 45) return diff >= 0 ? "just now" : "in <1m";
  const min = Math.floor(sec / 60);
  if (min < 60) return diff >= 0 ? `${min}m ago` : `in ${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return diff >= 0 ? `${hr}h ago` : `in ${hr}h`;
  const days = Math.floor(hr / 24);
  if (days < 30) return diff >= 0 ? `${days}d ago` : `in ${days}d`;
  return fmtShortDate(n);
}

export function toLocalISO(ms: number | null | undefined): string {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "";
  const d = new Date(n);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalISO(value: string | null | undefined): number | null {
  const s = String(value || "").trim();
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}

export function parseMeta(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function csvEscape(value: unknown): string {
  const s = String(value ?? "");
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
