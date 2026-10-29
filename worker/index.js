/**
 * KDeenOff — Cloudflare Worker entrypoint.
 *
 * Bindings:
 *   ASSETS -> static assets (eleventy `dist`)
 *   DB     -> D1 database
 */

import {
  handleGetBoard,
  handleListBoards,
  handleListHistory,
} from "./routes/leaderboards.js";
import { handleAdmin } from "./routes/admin.js";
import { jsonResponse, notFound } from "./lib/response.js";
import { ensureCsrfToken } from "./lib/csrf.js";
import { runScheduledWagerGrowth } from "./lib/wager-growth.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 1. API: Public leaderboards
    if (pathname === "/api/leaderboards" || pathname === "/api/leaderboards/") {
      return handleListBoards(env);
    }
    if (pathname === "/api/leaderboards/history" || pathname === "/api/leaderboards/history/") {
      return handleListHistory(env);
    }
    const lbMatch = pathname.match(/^\/api\/leaderboards\/([a-z0-9][a-z0-9-]{0,38}[a-z0-9])\/?$/);
    if (lbMatch) {
      return handleGetBoard(env, lbMatch[1]);
    }

    // 2. API: Admin
    if (pathname.startsWith("/api/admin")) {
      return handleAdmin(request, env, url);
    }

    // 3. Static routing rewrites & CSRF token for web pages
    const { token: csrfToken, cookieHeader: csrfCookie } = ensureCsrfToken(request);

    // Dynamic public board rewrite: /leaderboards/<slug>/ -> /leaderboards/_board/index.html
    const publicBoardMatch = pathname.match(/^\/leaderboards\/([a-z0-9][a-z0-9-]{0,38}[a-z0-9])\/?$/);
    if (publicBoardMatch && env.ASSETS) {
      const rewriteUrl = new URL("/leaderboards/_board/index.html", url.origin);
      const res = await env.ASSETS.fetch(new Request(rewriteUrl, request));
      return attachCsrfCookie(res, csrfCookie);
    }

    // Dynamic admin board editor rewrite: /admin/leaderboards/<slug>/ -> /admin/leaderboards/board.html
    const adminBoardMatch = pathname.match(/^\/admin\/leaderboards\/([a-z0-9][a-z0-9-]{0,38}[a-z0-9])\/?$/);
    if (adminBoardMatch && env.ASSETS) {
      const rewriteUrl = new URL("/admin/leaderboards/board.html", url.origin);
      const res = await env.ASSETS.fetch(new Request(rewriteUrl, request));
      return attachCsrfCookie(res, csrfCookie);
    }

    // Serve asset from dist via ASSETS binding
    if (env.ASSETS) {
      const res = await env.ASSETS.fetch(request);
      return attachCsrfCookie(res, csrfCookie);
    }

    return new Response("KDeenOff Leaderboard Worker Ready", { status: 200 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduledWagerGrowth(env));
  },
};

function attachCsrfCookie(res, cookieHeader) {
  if (!cookieHeader) return res;
  const headers = new Headers(res.headers);
  headers.append("set-cookie", cookieHeader);
  return new Response(res.body, { status: res.status, headers });
}
