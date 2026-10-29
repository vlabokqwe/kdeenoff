/**
 * Tiny Response helpers used everywhere. All responses are no-store by default;
 * cacheable assets go through the static asset binding instead.
 */

const NO_STORE = "no-store";

/**
 * @param {any} body
 * @param {number} [status]
 * @param {Record<string, string>} [extra]
 */
export function jsonResponse(body, status = 200, extra = {}) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": NO_STORE,
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    ...extra,
  });
  return new Response(JSON.stringify(body), { status, headers });
}

/** @param {string} html @param {number} [status] @param {Record<string,string>} [extra] */
export function htmlResponse(html, status = 200, extra = {}) {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": NO_STORE,
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      ...extra,
    },
  });
}

/** @param {string} location @param {Record<string,string>} [extra] */
export function redirect(location, extra = {}) {
  const headers = new Headers({ location, "cache-control": NO_STORE, ...extra });
  return new Response(null, { status: 302, headers });
}

/** Append one Set-Cookie header to a response, returning a new Response. */
export function withSetCookie(res, cookieHeader) {
  const headers = new Headers(res.headers);
  headers.append("set-cookie", cookieHeader);
  return new Response(res.body, { status: res.status, headers });
}

/** @param {string} method */
export function methodNotAllowed(method) {
  return jsonResponse({ error: `Method ${method} not allowed` }, 405);
}

/** @param {string} msg */
export function badRequest(msg = "Bad request") {
  return jsonResponse({ error: msg }, 400);
}

/** @param {string} msg */
export function unauthorized(msg = "Unauthorized") {
  return jsonResponse({ error: msg }, 401);
}

/** @param {string} msg */
export function forbidden(msg = "Forbidden") {
  return jsonResponse({ error: msg }, 403);
}

/** @param {string} msg */
export function notFound(msg = "Not found") {
  return jsonResponse({ error: msg }, 404);
}

/** @param {string} msg */
export function serverError(msg = "Server error") {
  return jsonResponse({ error: msg }, 500);
}

/** @param {string} s */
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
