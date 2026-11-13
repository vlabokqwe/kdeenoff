/**
 * Response helpers, same headers as the Worker's lib/response.js.
 * Handlers build an HttpResult; controllers write it with send().
 */
import type { Response } from "express";

const NO_STORE = "no-store";

export interface HttpResult {
  status: number;
  /** Ordered header pairs; "set-cookie" may repeat. */
  headers: [string, string][];
  body: string | Uint8Array | null;
}

function lowerEntries(obj: Record<string, string>): [string, string][] {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(obj)) map.set(k.toLowerCase(), v);
  return [...map.entries()];
}

export function jsonResponse(body: unknown, status = 200, extra: Record<string, string> = {}): HttpResult {
  return {
    status,
    headers: lowerEntries({
      "content-type": "application/json; charset=utf-8",
      "cache-control": NO_STORE,
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      ...extra,
    }),
    body: JSON.stringify(body),
  };
}

export function htmlResponse(html: string | Uint8Array, status = 200, extra: Record<string, string> = {}): HttpResult {
  return {
    status,
    headers: lowerEntries({
      "content-type": "text/html; charset=utf-8",
      "cache-control": NO_STORE,
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      ...extra,
    }),
    body: html,
  };
}

export function textResponse(text: string, status = 200, extra: Record<string, string> = {}): HttpResult {
  return {
    status,
    headers: lowerEntries({
      "content-type": "text/plain; charset=utf-8",
      "cache-control": NO_STORE,
      "x-content-type-options": "nosniff",
      ...extra,
    }),
    body: text,
  };
}

export function redirect(location: string, extra: Record<string, string> = {}, status = 302): HttpResult {
  return {
    status,
    headers: lowerEntries({ location, "cache-control": NO_STORE, ...extra }),
    body: null,
  };
}

/** Append Set-Cookie headers (falsy entries skipped), returning a new result. */
export function withCookies(res: HttpResult, cookies: (string | null | undefined)[]): HttpResult {
  const headers = [...res.headers];
  for (const cookie of cookies) {
    if (cookie) headers.push(["set-cookie", cookie]);
  }
  return { ...res, headers };
}

export function withSetCookie(res: HttpResult, cookie: string): HttpResult {
  return withCookies(res, [cookie]);
}

export function methodNotAllowed(method: string): HttpResult {
  return jsonResponse({ error: `Method ${method} not allowed` }, 405);
}

export function badRequest(msg = "Bad request"): HttpResult {
  return jsonResponse({ error: msg }, 400);
}

export function unauthorized(msg = "Unauthorized"): HttpResult {
  return jsonResponse({ error: msg }, 401);
}

export function forbidden(msg = "Forbidden"): HttpResult {
  return jsonResponse({ error: msg }, 403);
}

export function notFound(msg = "Not found"): HttpResult {
  return jsonResponse({ error: msg }, 404);
}

export function serverError(msg = "Server error"): HttpResult {
  return jsonResponse({ error: msg }, 500);
}

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Write an HttpResult to the Express response. */
export function send(res: Response, result: HttpResult): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.status(result.status);
  for (const [name, value] of result.headers) {
    if (name === "set-cookie") res.append("set-cookie", value);
    else res.setHeader(name, value);
  }
  if (result.body == null) {
    if (result.status !== 204 && result.status !== 304) res.setHeader("content-length", "0");
    res.end();
    return;
  }
  const body =
    typeof result.body === "string"
      ? Buffer.from(result.body, "utf8")
      : Buffer.isBuffer(result.body)
        ? result.body
        : Buffer.from(result.body);
  res.setHeader("content-length", String(body.length));
  res.end(body);
}
