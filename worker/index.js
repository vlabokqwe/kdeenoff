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
import { handlePublicRaffles } from "./routes/raffles.js";
import {
  handleKickCallback,
  handleKickConnect,
  handleKickLogout,
  handleKickMe,
} from "./routes/kick.js";
import {
  handleAccountEmail,
  handleAccountEmailConfirm,
  handleAccountLogout,
} from "./routes/account.js";
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

    // 2. API: Public raffles
    if (pathname === "/api/raffles" || pathname === "/api/raffles/") {
      return handlePublicRaffles(env);
    }

    // 3. API: Kick account link
    if (pathname === "/api/kick/me" || pathname === "/api/kick/me/") {
      return handleKickMe(request, env);
    }
    if (pathname === "/api/kick/connect" || pathname === "/api/kick/connect/") {
      return handleKickConnect(request, env);
    }
    if (pathname === "/api/kick/callback" || pathname === "/api/kick/callback/") {
      return handleKickCallback(request, env);
    }
    if (pathname === "/api/kick/logout" || pathname === "/api/kick/logout/") {
      return handleKickLogout(request, env);
    }
    if (pathname === "/api/account/email" || pathname === "/api/account/email/") {
      return handleAccountEmail(request, env);
    }
    if (pathname === "/api/account/email/confirm" || pathname === "/api/account/email/confirm/") {
      return handleAccountEmailConfirm(request, env);
    }
    if (pathname === "/api/account/logout" || pathname === "/api/account/logout/") {
      return handleAccountLogout(request, env);
    }

    // 4. API: Admin
    if (pathname.startsWith("/api/admin")) {
      return handleAdmin(request, env, url);
    }

    // 5. Static routing rewrites & CSRF token for web pages
    const { token: csrfToken, cookieHeader: csrfCookie } = ensureCsrfToken(request);

    // Dynamic public board rewrite: /leaderboards/<slug>/ -> /leaderboards/_board/index.html
    const publicBoardMatch = pathname.match(/^\/leaderboards\/([a-z0-9][a-z0-9-]{0,38}[a-z0-9])\/?$/);
    if (publicBoardMatch && env.ASSETS) {
      const res = await fetchAsset(env, request, "/leaderboards/_board/index.html");
      return attachCsrfCookie(res, csrfCookie);
    }

    // Dynamic admin board editor rewrite: /admin/leaderboards/<slug>/ -> /admin/leaderboards/board.html
    const adminBoardMatch = pathname.match(/^\/admin\/leaderboards\/([a-z0-9][a-z0-9-]{0,38}[a-z0-9])\/?$/);
    if (adminBoardMatch && env.ASSETS) {
      const res = await fetchAsset(env, request, "/admin/leaderboards/board.html");
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

async function fetchAsset(env, request, pathname) {
  const url = new URL(request.url);
  let assetUrl = new URL(pathname, url.origin);
  let res = await env.ASSETS.fetch(new Request(assetUrl, request));

  // Local asset serving redirects "/file.html" to the extensionless path.
  // Follow that inside the Worker so the browser keeps the public URL.
  for (let hop = 0; hop < 3 && res.status >= 300 && res.status < 400; hop++) {
    const location = res.headers.get("Location");
    if (!location) break;
    assetUrl = new URL(location, assetUrl);
    res = await env.ASSETS.fetch(new Request(assetUrl, request));
  }

  return res;
}

function attachCsrfCookie(res, cookieHeader) {
  if (!cookieHeader) return res;
  const headers = new Headers(res.headers);
  headers.append("set-cookie", cookieHeader);
  return new Response(res.body, { status: res.status, headers });
}
