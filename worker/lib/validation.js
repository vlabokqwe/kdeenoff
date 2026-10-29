/**
 * Tiny, dependency-free validators.
 */

export function isString(v) {
  return typeof v === "string";
}

export function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

export function isValidEmail(email) {
  if (typeof email !== "string" || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function asString(v) {
  return typeof v === "string" ? v : "";
}

export function asTrimmed(v) {
  return asString(v).trim();
}

export function asInt(v) {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Math.trunc(Number(v));
  }
  return null;
}

export function asBool(v) {
  if (typeof v === "boolean") return v;
  if (v === 1 || v === "1" || v === "true" || v === "on") return true;
  if (v === 0 || v === "0" || v === "false" || v === "off" || v === "") return false;
  return null;
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export function isValidSlug(slug) {
  return typeof slug === "string" && SLUG_RE.test(slug);
}

export function toSlug(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

const READ_BODY_MAX_BYTES = 512 * 1024; // 512 KB

export async function readBody(request) {
  const ct = request.headers.get("content-type") || "";
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > READ_BODY_MAX_BYTES) return null;

  if (ct.includes("application/json")) {
    try {
      const text = await request.text();
      if (!text || text.length === 0) return null;
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    try {
      const fd = await request.formData();
      const out = {};
      for (const [k, v] of fd.entries()) out[k] = v;
      return out;
    } catch {
      return null;
    }
  }
  return null;
}
