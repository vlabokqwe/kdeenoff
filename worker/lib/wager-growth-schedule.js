/**
 * Deterministic wager-growth schedule (72h horizon). Shared logic for worker + admin UI.
 */

export const WAGER_GROWTH_PCT_MAX = 500;
export const WAGER_GROWTH_SCHEDULE_HORIZON_MS = 72 * 60 * 60 * 1000;
export const WAGER_GROWTH_INTERVAL_MIN_MS = 60_000;
export const WAGER_GROWTH_INTERVAL_MAX_MS = 30 * 24 * 60 * 60 * 1000;

export function clampWagerGrowthPct(n) {
  if (n == null || !Number.isFinite(n)) return 3;
  return Math.max(0, Math.min(Math.floor(n), WAGER_GROWTH_PCT_MAX));
}

export function clampWagerGrowthIntervalMs(n) {
  if (n == null || !Number.isFinite(n)) return 12 * 60 * 60 * 1000;
  return Math.max(
    WAGER_GROWTH_INTERVAL_MIN_MS,
    Math.min(Math.floor(n), WAGER_GROWTH_INTERVAL_MAX_MS),
  );
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seededApproxPct(targetPct, seedStr) {
  const target = clampWagerGrowthPct(targetPct);
  if (target <= 0) return 0;
  let x = hashSeed(String(seedStr));
  x = Math.imul(x ^ (x >>> 16), 2246822507);
  x = Math.imul(x ^ (x >>> 13), 3266489909);
  x ^= x >>> 16;
  const t = (x >>> 0) / 0xffffffff;
  const spread = Math.min(Math.max(1, target * 0.25), 5);
  const offset = (t * 2 - 1) * spread;
  return Math.max(0.1, target + offset);
}

export function parseWagerGrowthSchedule(json) {
  if (!json || typeof json !== "string") return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (item) =>
        item &&
        typeof item === "object" &&
        Number.isFinite(item.at_ms) &&
        Number.isFinite(item.wagered_cents),
    );
  } catch {
    return [];
  }
}

export function buildWagerGrowthSchedule(opts) {
  const interval = clampWagerGrowthIntervalMs(opts.intervalMs);
  const cap = clampWagerGrowthPct(opts.targetPct);
  const now = Number(opts.now) || Date.now();
  const horizonMs = opts.horizonMs ?? WAGER_GROWTH_SCHEDULE_HORIZON_MS;
  const anchorMs = Number(opts.anchorMs) || now;
  const end = now + horizonMs;
  const playerId = opts.playerId;
  const boardId = opts.boardId;

  const items = [];
  let wagered = Math.max(0, Math.floor(Number(opts.startWageredCents) || 0));
  let at = anchorMs + interval;
  let tickIndex = 0;

  while (at <= end) {
    const pct = seededApproxPct(cap, `${playerId}:${boardId}:${anchorMs}:${tickIndex}`);
    const delta = Math.round((wagered * pct) / 100);
    wagered = Math.max(0, wagered + delta);
    items.push({
      at_ms: at,
      wagered_cents: wagered,
      pct: Math.round(pct * 100) / 100,
    });
    at += interval;
    tickIndex++;
  }
  return items;
}

export function serializeWagerGrowthSchedule(items) {
  return JSON.stringify(items);
}

export function nextGrowthTickAt(lastAt, intervalMs) {
  const interval = clampWagerGrowthIntervalMs(intervalMs);
  const la = Number(lastAt) || 0;
  if (!la) return Date.now() + interval;
  return la + interval;
}

export function formatGrowthCountdown(msUntil) {
  const ms = Math.max(0, Math.floor(msUntil));
  if (ms <= 0) return "due now";
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
