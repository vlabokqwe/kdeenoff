import type { Request } from "express";

/**
 * Request helpers that replace `new URL(request.url)` from the Worker.
 *
 * Express gives `req.protocol` / `req.host` from X-Forwarded-Proto / X-Forwarded-Host only when
 * the `trust proxy` setting (env TRUST_PROXY) trusts the peer, otherwise from the socket / Host header.
 */

/** Public origin of this request, e.g. "https://kdeenoff.bet". */
export function publicOrigin(req: Request): string {
  const proto = isSecureRequest(req) ? "https" : "http";
  const host = req.host || "localhost";
  try {
    return new URL(`${proto}://${host}`).origin;
  } catch {
    return `${proto}://localhost`;
  }
}

/**
 * Same rule as the Worker's buildCookie: https URL, or X-Forwarded-Proto: https.
 * The header only ever adds the Secure flag, so honoring it unconditionally is safe
 * (and keeps cookies Secure behind a Cloudflare Tunnel that talks plain HTTP to us).
 */
export function isSecureRequest(req: Request): boolean {
  if (req.protocol === "https") return true;
  const xfp = req.headers["x-forwarded-proto"];
  return (Array.isArray(xfp) ? xfp[0] : xfp) === "https";
}

/** Raw path of the request (no query), exactly as sent. */
export function rawPath(req: Request): string {
  const url = req.originalUrl || req.url || "/";
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

/** Query string including "?" (or ""). */
export function rawSearch(req: Request): string {
  const url = req.originalUrl || req.url || "/";
  const q = url.indexOf("?");
  return q === -1 ? "" : url.slice(q);
}

/** WHATWG-normalized pathname, what `new URL(request.url).pathname` gave in the Worker. */
export function normalizedPath(req: Request): string {
  try {
    return new URL(req.originalUrl || req.url || "/", "http://localhost").pathname;
  } catch {
    return rawPath(req);
  }
}

/** Query parameters with URLSearchParams semantics (like `url.searchParams`). */
export function searchParams(req: Request): URLSearchParams {
  return new URLSearchParams(rawSearch(req));
}

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function isLoopbackAddress(addr: string | undefined): boolean {
  if (!addr) return false;
  if (LOOPBACK_ADDRESSES.has(addr)) return true;
  return /^(::ffff:)?127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(addr);
}

/**
 * Local preview check (admin bypass without Access, /api/dev/account).
 * The Worker trusted the URL hostname because Cloudflare set it. Here it must not be spoofable:
 *   - never in production (NODE_ENV=production),
 *   - the TCP peer must be loopback (socket address, not X-Forwarded-For),
 *   - the raw Host header must be localhost / 127.0.0.1 / [::1] (X-Forwarded-Host is ignored),
 *   - no Cloudflare edge headers (a tunnel connector on this machine also connects from loopback).
 */
export function isLocalDevRequest(req: Request, isProduction: boolean): boolean {
  if (isProduction) return false;
  if (!isLoopbackAddress(req.socket?.remoteAddress)) return false;
  if (req.headers["cf-connecting-ip"] || req.headers["cf-ray"]) return false;
  const host = req.headers.host;
  if (!host) return false;
  let hostname = "";
  try {
    hostname = new URL(`http://${host}`).hostname;
  } catch {
    return false;
  }
  return LOCAL_HOSTNAMES.has(hostname);
}
