/**
 * Tiny, dependency-free validators.
 */

export function isString(v: unknown): v is string {
  return typeof v === "string";
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function isValidEmail(email: unknown): boolean {
  if (typeof email !== "string" || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeEmail(email: unknown): string {
  return String(email || "").trim().toLowerCase();
}

export function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function asTrimmed(v: unknown): string {
  return asString(v).trim();
}

export function asInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Math.trunc(Number(v));
  }
  return null;
}

export function asBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === 1 || v === "1" || v === "true" || v === "on") return true;
  if (v === 0 || v === "0" || v === "false" || v === "off" || v === "") return false;
  return null;
}

export const RESERVED_BOARD_SLUGS = new Set([
  "history",
  "avatar",
  "site",
  "_board",
  "admin",
  "new",
  "api",
]);

/** Route patterns, identical to the Worker router. */
export const BOARD_SLUG_ROUTE_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;
export const ROUTE_ID_RE = /^\d{1,15}$/;

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;

export function isValidSlug(slug: unknown): slug is string {
  return typeof slug === "string" && SLUG_RE.test(slug) && !RESERVED_BOARD_SLUGS.has(slug);
}

export function toSlug(s: unknown): string {
  const cleaned = String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  if (cleaned.length < 2 || RESERVED_BOARD_SLUGS.has(cleaned)) return "";
  return cleaned;
}
