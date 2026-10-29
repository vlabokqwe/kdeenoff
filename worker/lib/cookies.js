/**
 * Cookie parsing & building for Cloudflare Workers.
 */

export const CSRF_COOKIE = "kdeenoff_csrf";

export function readCookie(header, name) {
  if (!header) return null;
  const parts = header.split(";");
  for (const part of parts) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function readAllCookies(header, name) {
  if (!header) return [];
  const out = [];
  const parts = header.split(";");
  for (const part of parts) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) out.push(decodeURIComponent(v.join("=")));
  }
  return out;
}

export function buildCookie(name, value, request, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.expires) parts.push(`Expires=${opts.expires.toUTCString()}`);
  parts.push(`Path=${opts.path || "/"}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  parts.push(`SameSite=${opts.sameSite || "Lax"}`);

  const isSecure =
    request &&
    (request.url.startsWith("https:") || request.headers.get("x-forwarded-proto") === "https");
  if (isSecure || opts.secure) parts.push("Secure");

  return parts.join("; ");
}
