/**
 * Shared helpers for leaderboard data (sidebar cards, home dashboard, board shells)
 * and the countdown / money formatting used across the site.
 */
import { site } from "../../shared/site";
import type { Board, SiteSettings } from "./types";

const BOARDS_TTL_MS = 15_000;
let boardsCache: { at: number; promise: Promise<Board[]> } | null = null;

const SITE_SETTINGS_TTL_MS = 15_000;
let siteSettingsCache: { at: number; promise: Promise<SiteSettings> } | null = null;

export function defaultSiteSettings(): SiteSettings {
  return {
    promo_code: site.promoCode,
    partner_name: site.partners[0]?.name || "500 Casino",
    partner_signup_url: site.partners[0]?.url || site.referralUrl,
    headline_prize: "$10K",
    kick_channel: site.kickChannel,
    kick_url: site.kickUrl,
    telegram_url: site.telegramUrl,
  };
}

/** Clear the shared 15s board cache (e.g. after an admin dashboard edit). */
export function invalidateBoardsCache(): void {
  boardsCache = null;
}

/** Clear the shared 15s site settings cache (e.g. after an admin dashboard edit). */
export function invalidateSiteSettingsCache(): void {
  siteSettingsCache = null;
}

/** Live site settings from /api/site, falling back cleanly to shared/site.ts defaults. */
export function fetchSiteSettings(): Promise<SiteSettings> {
  const now = Date.now();
  if (!siteSettingsCache || now - siteSettingsCache.at > SITE_SETTINGS_TTL_MS) {
    const defaults = defaultSiteSettings();
    const promise = fetch("/api/site", {
      cache: "no-store",
      headers: { accept: "application/json" },
    })
      .then((res) =>
        res.ok
          ? (res.json() as Promise<{ settings?: Partial<Record<keyof SiteSettings, string>> }>)
          : { settings: {} },
      )
      .then((data) => {
        const raw = data?.settings || {};
        return {
          promo_code: raw.promo_code?.trim() || defaults.promo_code,
          partner_name: raw.partner_name?.trim() || defaults.partner_name,
          partner_signup_url: raw.partner_signup_url?.trim() || defaults.partner_signup_url,
          headline_prize: raw.headline_prize?.trim() || defaults.headline_prize,
          kick_channel: raw.kick_channel?.trim() || defaults.kick_channel,
          kick_url: raw.kick_url?.trim() || defaults.kick_url,
          telegram_url: raw.telegram_url?.trim() || defaults.telegram_url,
        };
      })
      .catch(() => defaults);
    siteSettingsCache = { at: now, promise };
  }
  return siteSettingsCache.promise;
}

/**
 * Visible boards from /api/leaderboards. The old site fetched them once per page load;
 * the SPA shares one request between everything rendered for the same navigation.
 */
export function fetchBoards(): Promise<Board[]> {
  const now = Date.now();
  if (!boardsCache || now - boardsCache.at > BOARDS_TTL_MS) {
    const promise = fetch("/api/leaderboards", { cache: "no-store", headers: { accept: "application/json" } })
      .then((res) => (res.ok ? (res.json() as Promise<{ boards?: Board[] }>) : { boards: [] }))
      .then((data) => (Array.isArray(data.boards) ? data.boards : []))
      .catch(() => [] as Board[]);
    boardsCache = { at: now, promise };
  }
  return boardsCache.promise;
}

/** Partners that have their own card art + colours. Everything else is "generic". */
const THEMES = new Set(["stake"]);

export function partnerTheme(partner: unknown): string {
  const key = String(partner || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!key || key === "500" || key === "500casino") return "stake";
  return THEMES.has(key) ? key : "generic";
}

export function partnerLabel(partner: unknown): string {
  const raw = String(partner || "").trim();
  const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!key || key === "stake" || key === "500" || key === "500casino") {
    return "500 Casino";
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const moneyShortFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export const money = (cents: unknown): string => moneyFmt.format((Number(cents) || 0) / 100);
export const moneyShort = (cents: unknown): string => moneyShortFmt.format((Number(cents) || 0) / 100);

/** 10000 → "10K", 1500 → "1.5K", 1000000 → "1M". */
export function moneyK(cents: unknown): string {
  const value = (Number(cents) || 0) / 100;
  const sign = value < 0 ? "-" : "";
  const n = Math.abs(value);
  const trim = (v: number) => (v >= 100 ? v.toFixed(0) : v.toFixed(1)).replace(/\.0$/, "");
  if (n >= 1_000_000) return `${sign}${trim(n / 1_000_000)}M`;
  if (n >= 1_000) return `${sign}${trim(n / 1_000)}K`;
  return `${sign}${Math.round(n)}`;
}

export type Cadence = "WEEKLY" | "MONTHLY" | "DAILY" | "RACE";

/** WEEKLY / MONTHLY / DAILY from the title, otherwise from the race length. */
export function boardCadence(board: Board | null | undefined): Cadence {
  const text = `${board?.title || ""} ${board?.subtitle || ""} ${board?.slug || ""}`.toLowerCase();
  if (/\bweek(ly)?\b/.test(text)) return "WEEKLY";
  if (/\bmonth(ly)?\b/.test(text)) return "MONTHLY";
  if (/\bdaily\b|\bday(s)?\b/.test(text)) return "DAILY";
  const days = (Number(board?.ends_at) - Number(board?.starts_at)) / 86400000;
  if (days > 0 && days <= 2) return "DAILY";
  if (days > 2 && days <= 10) return "WEEKLY";
  if (days > 10 && days <= 45) return "MONTHLY";
  return "RACE";
}

/** Custom badge if set on the board, otherwise WEEKLY / MONTHLY / DAILY ("" for generic RACE). */
export function boardBadge(board: Board | null | undefined): string {
  const custom = board?.badge?.trim();
  if (custom) return custom.toUpperCase();
  const c = boardCadence(board);
  return c === "RACE" ? "" : c;
}

export const pad2 = (n: number): string => String(n).padStart(2, "0");

export interface Dhms {
  d: string;
  h: string;
  m: string;
  s: string;
}

/** Split a duration into zero-padded parts, or null when it is over. */
export function dhms(ms: number): Dhms | null {
  if (!(ms > 0)) return null;
  const total = Math.floor(ms / 1000);
  return {
    d: pad2(Math.floor(total / 86400)),
    h: pad2(Math.floor((total % 86400) / 3600)),
    m: pad2(Math.floor((total % 3600) / 60)),
    s: pad2(total % 60),
  };
}

/** "5d 04:12:33" / "04:12:33", or null when it is over. */
export function countdown(ms: number): string | null {
  if (!(ms > 0)) return null;
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const clock = `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  return d > 0 ? `${d}d ${clock}` : clock;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;

/** A valid public board slug, or null. */
export function validSlug(value: string | null | undefined): string | null {
  const slug = String(value || "");
  return SLUG_RE.test(slug) && slug !== "_board" ? slug : null;
}

/** Slug from /leaderboards/<slug>/ or null. */
export function slugFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/leaderboards\/([a-z0-9][a-z0-9-]{0,38}[a-z0-9])\/?$/);
  return m ? validSlug(m[1]) : null;
}

/** Local link to a board page. */
export function boardHref(slug: string): string {
  return `/leaderboards/${encodeURIComponent(slug)}/`;
}
