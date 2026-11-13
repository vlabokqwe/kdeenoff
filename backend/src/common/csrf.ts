/**
 * CSRF protection: double-submit cookie.
 */
import type { Request } from "express";
import { CSRF_COOKIE, buildCookie, cookieHeader, readAllCookies, readCookie } from "./cookies";
import { randomB64url, timingSafeEqualStr } from "./crypto";
import { publicOrigin } from "./http/request";

export const CSRF_TTL_SECONDS = 12 * 60 * 60;
const CSRF_COOKIE_PATH = "/";

export function setCsrfCookieHeader(token: string, req: Request): string {
  return buildCookie(CSRF_COOKIE, token, req, {
    maxAge: CSRF_TTL_SECONDS,
    httpOnly: false, // readable by JS
    path: CSRF_COOKIE_PATH,
    sameSite: "Lax",
  });
}

export function ensureCsrfToken(req: Request): { token: string; cookieHeader: string | null } {
  let token = readCookie(cookieHeader(req), CSRF_COOKIE);
  let header: string | null = null;
  if (!token || token.length < 24) {
    token = randomB64url(24);
    header = setCsrfCookieHeader(token, req);
  }
  return { token, cookieHeader: header };
}

export type CsrfCheck = { ok: true } | { ok: false; error: string };

export function verifyCsrf(req: Request): CsrfCheck {
  const m = req.method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return { ok: true };

  const header = req.get("x-csrf");
  if (!header || header.length < 24) return { ok: false, error: "Missing CSRF token." };

  const cookies = readAllCookies(cookieHeader(req), CSRF_COOKIE);
  if (!cookies.length) return { ok: false, error: "Missing CSRF token in cookie." };

  const matched = cookies.some((c) => c.length >= 24 && timingSafeEqualStr(c, header));
  if (!matched) return { ok: false, error: "Invalid CSRF token." };
  return { ok: true };
}

/**
 * Extra check for writes that change balances: the browser must say the request
 * came from this site. Origin is sent by every current browser on POST.
 */
export function verifySameOrigin(req: Request): boolean {
  const origin = req.get("origin");
  const site = req.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  if (!origin) return Boolean(site);
  try {
    return new URL(origin).origin === publicOrigin(req);
  } catch {
    return false;
  }
}
