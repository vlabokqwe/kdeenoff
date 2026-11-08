/**
 * Shared helpers for leaderboard data (sidebar cards + board shells).
 */

let listPromise = null;

/** Visible boards from /api/leaderboards, fetched once per page. */
export function fetchBoards() {
  if (!listPromise) {
    listPromise = fetch("/api/leaderboards", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { boards: [] }))
      .then((data) => data.boards || [])
      .catch(() => []);
  }
  return listPromise;
}

/** Partners that have their own card art + colours. Everything else is "generic". */
const THEMES = new Set(["stake"]);

export function partnerTheme(partner) {
  const key = String(partner || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return THEMES.has(key) ? key : "generic";
}

export function partnerLabel(partner) {
  const raw = String(partner || "").trim();
  if (!raw) return "KDeenOff";
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

export const money = (cents) => moneyFmt.format((Number(cents) || 0) / 100);
export const moneyShort = (cents) => moneyShortFmt.format((Number(cents) || 0) / 100);

/** 10000 → "10K", 1500 → "1.5K", 1000000 → "1M". */
export function moneyK(cents) {
  const value = (Number(cents) || 0) / 100;
  const sign = value < 0 ? "-" : "";
  const n = Math.abs(value);
  const trim = (v) => (v >= 100 ? v.toFixed(0) : v.toFixed(1)).replace(/\.0$/, "");
  if (n >= 1_000_000) return `${sign}${trim(n / 1_000_000)}M`;
  if (n >= 1_000) return `${sign}${trim(n / 1_000)}K`;
  return `${sign}${Math.round(n)}`;
}

/** WEEKLY / MONTHLY / DAILY from the title, otherwise from the race length. */
export function boardCadence(board) {
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

const pad = (n) => String(n).padStart(2, "0");

/** "5д 04:12:33" / "04:12:33" */
/** Split a duration into zero-padded parts, or null when it is over. */
export function dhms(ms) {
  if (ms <= 0) return null;
  const total = Math.floor(ms / 1000);
  return {
    d: pad(Math.floor(total / 86400)),
    h: pad(Math.floor((total % 86400) / 3600)),
    m: pad(Math.floor((total % 3600) / 60)),
    s: pad(total % 60),
  };
}

/** "5d 04:12:33" / "04:12:33" */
export function countdown(ms) {
  if (ms <= 0) return null;
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const clock = `${pad(h)}:${pad(m)}:${pad(s)}`;
  return d > 0 ? `${d}д ${clock}` : clock;
  return d > 0 ? `${d}d ${clock}` : clock;
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

/** Slug from /leaderboards/<slug>/ or null. */
export function slugFromPath() {
  const m = location.pathname.match(/^\/leaderboards\/([a-z0-9][a-z0-9-]{0,38}[a-z0-9])\/?$/);
  return m && m[1] !== "_board" ? m[1] : null;
}

/** One shared 1s ticker for every countdown on the page. */
const tickers = new Set();
let tickHandle = 0;
export function onTick(fn) {
  tickers.add(fn);
  fn();
  if (!tickHandle) {
    tickHandle = window.setInterval(() => tickers.forEach((t) => t()), 1000);
  }
  return () => tickers.delete(fn);
}

