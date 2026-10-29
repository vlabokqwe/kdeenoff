/**
 * CSRF protection: double-submit cookie.
 */
import { buildCookie, readCookie, readAllCookies, CSRF_COOKIE } from "./cookies.js";
import { randomB64url, timingSafeEqualStr } from "./crypto.js";

export const CSRF_TTL_SECONDS = 12 * 60 * 60;
const CSRF_COOKIE_PATH = "/";

export function setCsrfCookieHeader(token, request) {
  return buildCookie(CSRF_COOKIE, token, request, {
    maxAge: CSRF_TTL_SECONDS,
    httpOnly: false, // readable by JS
    path: CSRF_COOKIE_PATH,
    sameSite: "Lax",
  });
}

export function ensureCsrfToken(request) {
  let token = readCookie(request.headers.get("cookie"), CSRF_COOKIE);
  let cookieHeader = null;
  if (!token || token.length < 24) {
    token = randomB64url(24);
    cookieHeader = setCsrfCookieHeader(token, request);
  }
  return { token, cookieHeader };
}

export function verifyCsrf(request) {
  const m = request.method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return { ok: true };

  const header = request.headers.get("x-csrf");
  if (!header || header.length < 24) return { ok: false, error: "Missing CSRF token." };

  const cookies = readAllCookies(request.headers.get("cookie"), CSRF_COOKIE);
  if (!cookies.length) return { ok: false, error: "Missing CSRF token in cookie." };

  const matched = cookies.some((c) => c.length >= 24 && timingSafeEqualStr(c, header));
  if (!matched) return { ok: false, error: "Invalid CSRF token." };
  return { ok: true };
}
