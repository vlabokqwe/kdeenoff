import { All, Controller, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { AccessService, isAdminPath } from "../access/access.service";
import { AdminService } from "../admin/admin.service";
import { ensureCsrfToken } from "../common/csrf";
import { normalizedPath, rawPath, rawSearch } from "../common/http/request";
import {
  htmlResponse,
  jsonResponse,
  methodNotAllowed,
  notFound,
  redirect,
  send,
  textResponse,
  withSetCookie,
} from "../common/http/response";
import { BOARD_SLUG_ROUTE_RE, ROUTE_ID_RE } from "../common/validation";
import { AppConfig } from "../config/app-config";

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

function resolveSafeFile(rootDir: string, relUrlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(relUrlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return null;
  const segments = decoded.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((s) => s === "." || s === "..")) return null;
  const resolvedRoot = resolve(rootDir);
  const candidate = resolve(resolvedRoot, ...segments);
  const rel = relative(resolvedRoot, candidate);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  try {
    const st = statSync(candidate);
    return st.isFile() ? candidate : null;
  } catch {
    return null;
  }
}

function serveStaticFile(res: Response, filePath: string, immutable: boolean): void {
  res.status(200);
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader(
    "cache-control",
    immutable ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
  );
  res.sendFile(filePath, { dotfiles: "deny", etag: true, lastModified: true }, (err) => {
    if (err && !res.headersSent) {
      send(res, textResponse("Not found", 404));
    }
  });
}

function serveHtmlFile(req: Request, res: Response, indexPath: string, status = 200): void {
  if (!existsSync(indexPath)) {
    send(res, textResponse("Frontend is not built. Run npm run build.", 503));
    return;
  }
  let html: Buffer;
  try {
    html = readFileSync(indexPath);
  } catch {
    send(res, textResponse("Frontend is not built. Run npm run build.", 503));
    return;
  }
  const { cookieHeader } = ensureCsrfToken(req);
  const result = htmlResponse(html, status, { "cache-control": "no-cache" });
  send(res, cookieHeader ? withSetCookie(result, cookieHeader) : result);
}

@Controller()
export class FrontendController {
  constructor(
    private readonly config: AppConfig,
    private readonly access: AccessService,
    private readonly admin: AdminService,
  ) { }

  @All()
  async root(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.handle(req, res);
  }

  @All("*path")
  async fallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.handle(req, res);
  }

  private async handle(req: Request, res: Response): Promise<void> {
    const raw = rawPath(req);
    const pathname = normalizedPath(req);
    const search = rawSearch(req);

    // 1. Normalized /api/admin gate & fallback
    if (isAdminPath(raw, "/api/admin") || isAdminPath(pathname, "/api/admin")) {
      const gate = await this.access.requireAdmin(req);
      if (!gate.ok) {
        send(res, jsonResponse({ error: gate.error }, gate.status));
        return;
      }
      send(res, await this.admin.handleAdmin(req, gate.actor));
      return;
    }

    // 2. Any other unknown /api/* path -> JSON 404
    if (
      pathname === "/api" ||
      pathname.startsWith("/api/") ||
      isAdminPath(raw, "/api") ||
      isAdminPath(pathname, "/api")
    ) {
      send(res, notFound());
      return;
    }

    // 3. Normalized /admin gate & routing
    if (isAdminPath(raw, "/admin") || isAdminPath(pathname, "/admin")) {
      const gate = await this.access.requireAdmin(req);
      if (!gate.ok) {
        const msg =
          gate.status === 503
            ? "Admin access is not configured."
            : gate.status === 401
              ? "Unauthorized"
              : "Forbidden";
        send(res, textResponse(msg, gate.status));
        return;
      }

      const method = req.method.toUpperCase();
      if (method !== "GET" && method !== "HEAD") {
        send(res, methodNotAllowed(req.method));
        return;
      }

      if (pathname === "/admin" || !pathname.startsWith("/admin/")) {
        send(res, redirect(`/admin/${search}`, {}, 301));
        return;
      }

      if (pathname.startsWith("/admin/assets/")) {
        const assetRel = pathname.slice("/admin/assets/".length);
        const assetPath = resolveSafeFile(
          join(this.config.frontendDist, "admin", "assets"),
          assetRel,
        );
        if (!assetPath) {
          send(res, textResponse("Not found", 404));
          return;
        }
        serveStaticFile(res, assetPath, true);
        return;
      }

      const adminIndex = join(this.config.frontendDist, "admin", "index.html");
      serveHtmlFile(req, res, adminIndex, 200);
      return;
    }

    // 4. Public static & SPA routing
    const method = req.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      send(res, methodNotAllowed(req.method));
      return;
    }

    const publicDir = join(this.config.frontendDist, "public");

    // Static file in <frontendDist>/public (excluding root index.html so SPA headers/CSRF apply)
    if (pathname !== "/" && pathname.toLowerCase() !== "/index.html") {
      const staticFile = resolveSafeFile(publicDir, pathname);
      if (staticFile) {
        serveStaticFile(res, staticFile, pathname.startsWith("/assets/"));
        return;
      }
    }

    // Known SPA routes without trailing slash -> 301 redirect to trailing slash version
    if (isKnownSlashlessPublicRoute(pathname)) {
      send(res, redirect(`${pathname}/${search}`, {}, 301));
      return;
    }

    const publicIndex = join(publicDir, "index.html");

    // Known SPA routes with trailing slash -> 200 index.html
    if (isKnownWithSlashPublicRoute(pathname)) {
      serveHtmlFile(req, res, publicIndex, 200);
      return;
    }

    // Any other path -> 404 index.html
    serveHtmlFile(req, res, publicIndex, 404);
  }
}
