import type { Request as ExpressRequest } from "express";
import { AccessService, isAdminPath } from "../backend/src/access/access.service";
import { AccountService } from "../backend/src/account/account.service";
import { AdminService } from "../backend/src/admin/admin.service";
import { AuditService } from "../backend/src/audit/audit.module";
import { ensureCsrfToken } from "../backend/src/common/csrf";
import { FETCH_REQUEST } from "../backend/src/common/http/read-body";
import { normalizedPath, rawPath, rawSearch } from "../backend/src/common/http/request";
import {
  type HttpResult,
  jsonResponse,
  methodNotAllowed,
  notFound,
  redirect,
  serverError,
  textResponse,
} from "../backend/src/common/http/response";
import { BOARD_SLUG_ROUTE_RE, ROUTE_ID_RE } from "../backend/src/common/validation";
import { AppConfig } from "../backend/src/config/app-config";
import { DevAccountService } from "../backend/src/dev-account/dev-account.service";
import { KickService } from "../backend/src/kick/kick.service";
import { LeaderboardsService } from "../backend/src/leaderboards/leaderboards.service";
import { RafflesService } from "../backend/src/raffles/raffles.service";
import { SessionService } from "../backend/src/session/session.service";
import { WagerGrowthService } from "../backend/src/wager-growth/wager-growth.service";
import { type CfD1Database, D1DatabaseService } from "./d1-database";
import { ensureD1Migrated } from "./d1-migrator";

export interface WorkerAssetsFetcher {
  fetch(input: Request | string | URL, init?: RequestInit): Promise<Response>;
}

export interface WorkerEnv extends Record<string, unknown> {
  DB: CfD1Database;
  ASSETS: WorkerAssetsFetcher;
  NODE_ENV?: string;
}

export interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

const KNOWN_PUBLIC_SLASHLESS = new Set([
  "/raffles",
  "/leaderboards",
  "/account",
  "/bonuses",
]);

const KNOWN_PUBLIC_WITH_SLASH = new Set([
  "/",
  "/raffles/",
  "/leaderboards/",
  "/account/",
  "/bonuses/",
]);

function isKnownSlashlessPublicRoute(pathname: string): boolean {
  if (KNOWN_PUBLIC_SLASHLESS.has(pathname)) return true;
  if (pathname.startsWith("/leaderboards/")) {
    const rest = pathname.slice("/leaderboards/".length);
    return !rest.includes("/") && BOARD_SLUG_ROUTE_RE.test(rest);
  }
  if (pathname.startsWith("/raffles/")) {
    const rest = pathname.slice("/raffles/".length);
    return !rest.includes("/") && ROUTE_ID_RE.test(rest) && Number(rest) > 0;
  }
  return false;
}

function isKnownWithSlashPublicRoute(pathname: string): boolean {
  if (KNOWN_PUBLIC_WITH_SLASH.has(pathname)) return true;
  if (pathname.startsWith("/leaderboards/") && pathname.endsWith("/")) {
    const rest = pathname.slice("/leaderboards/".length, -1);
    return !rest.includes("/") && BOARD_SLUG_ROUTE_RE.test(rest);
  }
  if (pathname.startsWith("/raffles/") && pathname.endsWith("/")) {
    const rest = pathname.slice("/raffles/".length, -1);
    return !rest.includes("/") && ROUTE_ID_RE.test(rest) && Number(rest) > 0;
  }
  return false;
}

function safeDecodeSegment(seg: string): string | null {
  try {
    return decodeURIComponent(seg);
  } catch {
    return null;
  }
}

function buildServices(env: WorkerEnv) {
  const config = new AppConfig({
    NODE_ENV: "production",
    ...(env as Record<string, unknown>),
  });
  const db = new D1DatabaseService(env.DB);
  const audit = new AuditService(db);
  const session = new SessionService(db);
  const access = new AccessService(config, session);
  const wagerGrowth = new WagerGrowthService(db, audit);
  const leaderboards = new LeaderboardsService(db);
  const raffles = new RafflesService(db, session, access, audit);
  const kick = new KickService(config, access, db, session);
  const account = new AccountService(config, access, db, session);
  const devAccount = new DevAccountService(config, access, db, session);
  const admin = new AdminService(db, audit, wagerGrowth, raffles);

  return {
    config,
    db,
    audit,
    session,
    access,
    wagerGrowth,
    leaderboards,
    raffles,
    kick,
    account,
    devAccount,
    admin,
  };
}

function toExpressLikeRequest(request: Request, url: URL): ExpressRequest {
  const schemeIdx = request.url.indexOf("://");
  const pathIdx = schemeIdx >= 0 ? request.url.indexOf("/", schemeIdx + 3) : -1;
  const rawUrl = pathIdx >= 0 ? request.url.slice(pathIdx) : `/${url.search}`;

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const cfIp = request.headers.get("cf-connecting-ip");
  const isLocalHost =
    url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  const remoteAddress = cfIp || (isLocalHost ? "127.0.0.1" : "");

  const shim = {
    method: request.method,
    url: rawUrl,
    originalUrl: rawUrl,
    protocol: url.protocol === "https:" ? "https" : "http",
    host: request.headers.get("host") || url.host,
    headers,
    socket: { remoteAddress },
    get(name: string): string | undefined {
      return request.headers.get(name) ?? undefined;
    },
    [FETCH_REQUEST]: request,
  };

  return shim as unknown as ExpressRequest;
}

function toWebResponse(result: HttpResult, method: string): Response {
  const headers = new Headers();
  for (const [name, value] of result.headers) {
    if (name.toLowerCase() === "set-cookie") {
      headers.append("set-cookie", value);
    } else {
      headers.set(name, value);
    }
  }
  const isNullBodyStatus =
    result.status === 204 || result.status === 205 || result.status === 304;
  if (result.body == null || isNullBodyStatus || method === "HEAD") {
    return new Response(null, { status: result.status, headers });
  }
  return new Response(result.body as BodyInit, { status: result.status, headers });
}

async function fetchStaticAsset(
  env: WorkerEnv,
  request: Request,
  assetPathname: string,
  immutable: boolean,
): Promise<Response | null> {
  const assetUrl = new URL(assetPathname, request.url);
  const fwdHeaders = new Headers();
  for (const h of ["range", "if-none-match", "if-modified-since", "if-range"]) {
    const val = request.headers.get(h);
    if (val) fwdHeaders.set(h, val);
  }
  const method = request.method.toUpperCase() === "HEAD" ? "HEAD" : "GET";
  const assetRes = await env.ASSETS.fetch(
    new Request(assetUrl.toString(), { method, headers: fwdHeaders }),
  );
  if (assetRes.status === 404) return null;

  const headers = new Headers(assetRes.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set(
    "cache-control",
    immutable ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
  );
  return new Response(method === "HEAD" || assetRes.status === 304 ? null : assetRes.body, {
    status: assetRes.status,
    headers,
  });
}

async function serveWorkerHtml(
  env: WorkerEnv,
  request: Request,
  req: ExpressRequest,
  indexAssetPath: "/index.html" | "/admin/index.html",
  status: number,
): Promise<Response> {
  const assetUrl = new URL(indexAssetPath, request.url);
  const assetRes = await env.ASSETS.fetch(new Request(assetUrl.toString(), { method: "GET" }));
  if (!assetRes.ok) {
    return toWebResponse(
      textResponse("Frontend is not built. Run npm run build:cf.", 503),
      request.method.toUpperCase(),
    );
  }

  const { cookieHeader } = ensureCsrfToken(req);
  const headers = new Headers();
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-cache");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  if (cookieHeader) headers.append("set-cookie", cookieHeader);

  const isHead = request.method.toUpperCase() === "HEAD";
  return new Response(isHead ? null : assetRes.body, { status, headers });
}

export default {
  async fetch(request: Request, env: WorkerEnv, _ctx: WorkerExecutionContext): Promise<Response> {
    const method = request.method.toUpperCase();
    try {
      await ensureD1Migrated(env.DB);

      const url = new URL(request.url);
      const req = toExpressLikeRequest(request, url);
      const raw = rawPath(req);
      const pathname = normalizedPath(req);
      const search = rawSearch(req);
      const services = buildServices(env);

      // 1. Admin API gate & routing
      if (isAdminPath(raw, "/api/admin") || isAdminPath(pathname, "/api/admin")) {
        const gate = await services.access.requireAdmin(req);
        if (!gate.ok) {
          return toWebResponse(jsonResponse({ error: gate.error }, gate.status), method);
        }
        return toWebResponse(await services.admin.handleAdmin(req, gate.actor), method);
      }

      // 2. Public & authenticated API routes
      if (
        pathname === "/api" ||
        pathname.startsWith("/api/") ||
        isAdminPath(raw, "/api") ||
        isAdminPath(pathname, "/api")
      ) {
        const cleanApi =
          pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;

        // /api/site
        if (cleanApi === "/api/site") {
          if (method !== "GET" && method !== "HEAD") {
            return toWebResponse(methodNotAllowed(req.method), method);
          }
          return toWebResponse(await services.leaderboards.handleGetSiteSettings(), method);
        }

        // /api/leaderboards*
        if (cleanApi === "/api/leaderboards") {
          if (method !== "GET" && method !== "HEAD") {
            return toWebResponse(methodNotAllowed(req.method), method);
          }
          return toWebResponse(await services.leaderboards.handleListBoards(), method);
        }
        if (cleanApi === "/api/leaderboards/history") {
          if (method !== "GET" && method !== "HEAD") {
            return toWebResponse(methodNotAllowed(req.method), method);
          }
          return toWebResponse(await services.leaderboards.handleListHistory(), method);
        }
        const avatarMatch = /^\/api\/leaderboards\/avatar\/([^/]+)$/.exec(cleanApi);
        if (avatarMatch) {
          const seed = safeDecodeSegment(avatarMatch[1]);
          if (seed == null) return toWebResponse(notFound(), method);
          if (method !== "GET" && method !== "HEAD") {
            return toWebResponse(methodNotAllowed(req.method), method);
          }
          const preset = url.searchParams.get("preset") ?? undefined;
          return toWebResponse(services.leaderboards.handleGetAvatar(seed, preset), method);
        }
        const boardMatch = /^\/api\/leaderboards\/([^/]+)$/.exec(cleanApi);
        if (boardMatch) {
          const slug = safeDecodeSegment(boardMatch[1]);
          if (!slug || !BOARD_SLUG_ROUTE_RE.test(slug)) {
            return toWebResponse(notFound(), method);
          }
          if (method !== "GET" && method !== "HEAD") {
            return toWebResponse(methodNotAllowed(req.method), method);
          }
          let result = await services.leaderboards.handleGetBoard(slug);
          if (result.status === 404) {
            const gate = await services.access.requireAdmin(req);
            if (gate.ok) {
              result = await services.leaderboards.handleGetBoard(slug, { includeHidden: true });
            }
          }
          return toWebResponse(result, method);
        }

        // /api/raffles*
        if (cleanApi === "/api/raffles") {
          if (method !== "GET" && method !== "HEAD") {
            return toWebResponse(methodNotAllowed(req.method), method);
          }
          return toWebResponse(await services.raffles.handlePublicRaffles(), method);
        }
        if (cleanApi === "/api/raffles/mine") {
          return toWebResponse(await services.raffles.handleMyRaffles(req), method);
        }
        if (cleanApi === "/api/raffles/manage" || cleanApi.startsWith("/api/raffles/manage/")) {
          const gate = await services.access.requireStreamer(req);
          if (!gate.ok) {
            return toWebResponse(jsonResponse({ error: gate.error }, gate.status), method);
          }
          return toWebResponse(await services.raffles.handleManageRaffles(req, gate.actor), method);
        }
        const raffleJoinMatch = /^\/api\/raffles\/([^/]+)\/join$/.exec(cleanApi);
        if (raffleJoinMatch) {
          const id = safeDecodeSegment(raffleJoinMatch[1]);
          if (!id) return toWebResponse(notFound(), method);
          return toWebResponse(await services.raffles.handleRaffleJoin(req, id), method);
        }
        const raffleDetailMatch = /^\/api\/raffles\/([^/]+)$/.exec(cleanApi);
        if (raffleDetailMatch) {
          const id = safeDecodeSegment(raffleDetailMatch[1]);
          if (!id) return toWebResponse(notFound(), method);
          return toWebResponse(await services.raffles.handlePublicRaffleDetail(req, id), method);
        }

        // /api/kick*
        if (cleanApi === "/api/kick/me") {
          return toWebResponse(await services.kick.handleKickMe(req), method);
        }
        if (cleanApi === "/api/kick/connect") {
          return toWebResponse(services.kick.handleKickConnect(req), method);
        }
        if (cleanApi === "/api/kick/callback") {
          return toWebResponse(await services.kick.handleKickCallback(req), method);
        }
        if (cleanApi === "/api/kick/logout") {
          return toWebResponse(await services.kick.handleKickLogout(req), method);
        }
        if (cleanApi === "/api/kick/avatars") {
          return toWebResponse(await services.kick.handleChatAvatars(req), method);
        }

        // /api/account*
        if (cleanApi === "/api/account/email") {
          return toWebResponse(await services.account.handleAccountEmail(req), method);
        }
        if (cleanApi === "/api/account/email/confirm") {
          return toWebResponse(await services.account.handleAccountEmailConfirm(req), method);
        }
        if (cleanApi === "/api/account/partner") {
          return toWebResponse(await services.account.handleAccountPartner(req), method);
        }
        if (cleanApi === "/api/account/logout") {
          return toWebResponse(await services.account.handleAccountLogout(req), method);
        }

        // /api/dev/account
        if (cleanApi === "/api/dev/account") {
          return toWebResponse(await services.devAccount.handleDevAccount(req), method);
        }

        return toWebResponse(notFound(), method);
      }

      // 3. Normalized /admin gate & routing
      if (isAdminPath(raw, "/admin") || isAdminPath(pathname, "/admin")) {
        const gate = await services.access.requireAdmin(req);
        if (!gate.ok) {
          const msg =
            gate.status === 503
              ? "Admin access is not configured."
              : gate.status === 401
                ? "Unauthorized"
                : "Forbidden";
          return toWebResponse(textResponse(msg, gate.status), method);
        }

        if (method !== "GET" && method !== "HEAD") {
          return toWebResponse(methodNotAllowed(req.method), method);
        }

        if (pathname === "/admin" || !pathname.startsWith("/admin/")) {
          return toWebResponse(redirect(`/admin/${search}`, {}, 301), method);
        }

        if (pathname.startsWith("/admin/assets/")) {
          const assetRes = await fetchStaticAsset(env, request, pathname, true);
          if (!assetRes) {
            return toWebResponse(textResponse("Not found", 404), method);
          }
          return assetRes;
        }

        return serveWorkerHtml(env, request, req, "/admin/index.html", 200);
      }

      // 4. Public static & SPA routing
      if (method !== "GET" && method !== "HEAD") {
        return toWebResponse(methodNotAllowed(req.method), method);
      }

      if (pathname !== "/" && pathname.toLowerCase() !== "/index.html" && !pathname.endsWith("/")) {
        const staticRes = await fetchStaticAsset(
          env,
          request,
          pathname,
          pathname.startsWith("/assets/"),
        );
        if (staticRes) return staticRes;
      }

      if (isKnownSlashlessPublicRoute(pathname)) {
        return toWebResponse(redirect(`${pathname}/${search}`, {}, 301), method);
      }

      if (isKnownWithSlashPublicRoute(pathname)) {
        return serveWorkerHtml(env, request, req, "/index.html", 200);
      }

      return serveWorkerHtml(env, request, req, "/index.html", 404);
    } catch (err) {
      console.error("[Worker Error]", (err as Error)?.stack || String(err));
      return toWebResponse(serverError(), method);
    }
  },

  scheduled(_controller: unknown, env: WorkerEnv, ctx: WorkerExecutionContext): void {
    ctx.waitUntil(
      (async () => {
        await ensureD1Migrated(env.DB);
        const services = buildServices(env);
        try {
          await services.raffles.finalizeExpiredTimerRaffles();
        } catch (err) {
          console.error(
            `[Cron] scheduled raffle finalization failed: ${(err as Error)?.message || err}`,
          );
        }
        try {
          await services.wagerGrowth.runScheduledWagerGrowth();
        } catch (err) {
          console.error(
            `[Cron] scheduled wager growth failed: ${(err as Error)?.message || err}`,
          );
        }
      })(),
    );
  },
};

