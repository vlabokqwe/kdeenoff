/**
 * Link a Kick account to this browser.
 * GET  /api/kick/connect   start Kick login
 * GET  /api/kick/callback  Kick returns here
 * GET  /api/kick/me        current link
 * POST /api/kick/logout    drop the link on this browser
 */
import { Injectable, Logger } from "@nestjs/common";
import type { Request } from "express";
import { timingSafeEqualStr } from "../common/crypto";
import { ensureCsrfToken, verifyCsrf } from "../common/csrf";
import { searchParams } from "../common/http/request";
import {
  type HttpResult,
  forbidden,
  jsonResponse,
  methodNotAllowed,
  redirect,
  withCookies,
} from "../common/http/response";
import {
  clearOauthCookie,
  clearSessionCookie,
  kickClient,
  kickReady,
  kickRedirectUri,
  oauthCookie,
  pkceChallenge,
  randomOauthPair,
  readKickProfile,
  readPackedOauth,
} from "../common/kick";
import { AppConfig } from "../config/app-config";
import { AccessService } from "../access/access.service";
import { DatabaseService } from "../database/database.service";
import {
  buildLeaderboardAvatarUrl,
  loadAuthorizedKickNames,
  normalizeKickHandle,
} from "../leaderboards/lb-avatar";
import { type Person, SessionService, type UserRole } from "../session/session.service";

const ACCOUNT_ERRORS = new Set(["config", "denied", "state", "token", "profile", "store", "taken"]);

function accountError(code: string, cookies: (string | null | undefined)[] = []): HttpResult {
  const safe = ACCOUNT_ERRORS.has(code) ? code : "token";
  return withCookies(redirect(`/account/?error=${safe}`), cookies);
}

function safeToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,128}$/.test(value);
}

function safeCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._~-]{8,2048}$/.test(value);
}

function siteAvatarForPerson(person: Person): string {
  if (person.kickUserId && person.name) {
    return buildLeaderboardAvatarUrl(person.name);
  }
  if (person.emailVerified && person.email) {
    const emailSeed = person.email.split("@")[0] || person.id;
    return buildLeaderboardAvatarUrl(emailSeed);
  }
  return "";
}

function accountPayload(
  person: Person | null,
  roles: { role: UserRole; isAdmin: boolean; isStreamer: boolean } = {
    role: "player",
    isAdmin: false,
    isStreamer: false,
  },
  raffleBan: { permanent: boolean; bannedUntil: number | null } | null = null,
) {
  if (!person) {
    return {
      linked: false,
      name: "",
      avatarUrl: "",
      email: "",
      emailVerified: false,
      partnerUsername: "",
      raffleBan: null,
      role: "player" as UserRole,
      isAdmin: false,
      isStreamer: false,
    };
  }
  const linked = Boolean(person.kickUserId && person.name);
  return {
    linked,
    name: person.name || "",
    avatarUrl: siteAvatarForPerson(person),
    email: person.email || "",
    emailVerified: Boolean(person.emailVerified),
    partnerUsername: person.partnerUsername || "",
    raffleBan,
    role: roles.role,
    isAdmin: roles.isAdmin,
    isStreamer: roles.isStreamer,
  };
}

@Injectable()
export class KickService {
  private readonly logger = new Logger("Kick");

  constructor(
    private readonly config: AppConfig,
    private readonly access: AccessService,
    private readonly db: DatabaseService,
    private readonly session: SessionService,
  ) { }

  private async loadActiveBan(
    kickUserId: string,
  ): Promise<{ permanent: boolean; bannedUntil: number | null } | null> {
    if (!kickUserId) return null;
    const row = await this.db.first<{ is_permanent: number; banned_until: number | null }>(
      `SELECT is_permanent, banned_until FROM raffle_bans WHERE kick_user_id = ?`,
      kickUserId,
    );
    if (!row) return null;
    if (Number(row.is_permanent) === 1) {
      return { permanent: true, bannedUntil: null };
    }
    const until = row.banned_until != null ? Number(row.banned_until) : 0;
    if (until > Date.now()) {
      return { permanent: false, bannedUntil: until };
    }
    return null;
  }

  async handleKickMe(req: Request): Promise<HttpResult> {
    const m = req.method.toUpperCase();
    if (m !== "GET" && m !== "HEAD") return methodNotAllowed(req.method);

    const { cookieHeader: csrfCookie } = ensureCsrfToken(req);
    const loaded = await this.session.loadPerson(req);
    if (!loaded.person) {
      const body = jsonResponse(accountPayload(null));
      return withCookies(body, [csrfCookie, loaded.token ? clearSessionCookie(req) : null]);
    }
    const roles = await this.access.resolveAccountRoles(req);
    const raffleBan = await this.loadActiveBan(loaded.person.kickUserId);
    return withCookies(jsonResponse(accountPayload(loaded.person, roles, raffleBan)), [csrfCookie]);
  }

  handleKickConnect(req: Request): HttpResult {
    const m = req.method.toUpperCase();
    if (m !== "GET" && m !== "HEAD") return methodNotAllowed(req.method);
    if (!kickReady(this.config)) return accountError("config");

    const { state, verifier } = randomOauthPair();
    const challenge = pkceChallenge(verifier);
    const { id } = kickClient(this.config);
    const authorize = new URL("https://id.kick.com/oauth/authorize");
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("client_id", id);
    authorize.searchParams.set("redirect_uri", kickRedirectUri(req));
    authorize.searchParams.set("scope", "user:read");
    authorize.searchParams.set("state", state);
    authorize.searchParams.set("code_challenge", challenge);
    authorize.searchParams.set("code_challenge_method", "S256");

    return withCookies(redirect(authorize.toString()), [oauthCookie(`${state}.${verifier}`, req)]);
  }

  async handleKickCallback(req: Request): Promise<HttpResult> {
    const m = req.method.toUpperCase();
    if (m !== "GET" && m !== "HEAD") return methodNotAllowed(req.method);

    const params = searchParams(req);
    const clearOauth = clearOauthCookie(req);
    const kickError = params.get("error");
    if (kickError) {
      return accountError(kickError === "access_denied" ? "denied" : "token", [clearOauth]);
    }
    if (!kickReady(this.config)) return accountError("config", [clearOauth]);

    const code = params.get("code") || "";
    const state = params.get("state") || "";
    const saved = readPackedOauth(req);
    const stateOk =
      safeToken(state) &&
      safeToken(saved.state) &&
      safeToken(saved.verifier) &&
      timingSafeEqualStr(state, saved.state);
    if (!stateOk || !safeCode(code)) return accountError("state", [clearOauth]);

    const { id, secret } = kickClient(this.config);
    let accessToken = "";
    try {
      const tokenRes = await fetch("https://id.kick.com/oauth/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: id,
          client_secret: secret,
          redirect_uri: kickRedirectUri(req),
          code,
          code_verifier: saved.verifier,
        }),
      });
      if (!tokenRes.ok) {
        this.logger.error(`kick token exchange failed: ${tokenRes.status}`);
        return accountError("token", [clearOauth]);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tokenBody: any = await tokenRes.json();
      accessToken = typeof tokenBody?.access_token === "string" ? tokenBody.access_token : "";
    } catch {
      this.logger.error("kick token exchange error");
      return accountError("token", [clearOauth]);
    }
    if (!accessToken) return accountError("token", [clearOauth]);

    let profile = null;
    try {
      const userRes = await fetch("https://api.kick.com/public/v1/users", {
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: "application/json",
        },
      });
      if (!userRes.ok) {
        this.logger.error(`kick profile failed: ${userRes.status}`);
        return accountError("profile", [clearOauth]);
      }
      profile = readKickProfile(await userRes.text());
    } catch {
      this.logger.error("kick profile error");
      return accountError("profile", [clearOauth]);
    }
    if (!profile) return accountError("profile", [clearOauth]);

    const now = Date.now();
    try {
      await this.db.run(
        `INSERT INTO kick_accounts (kick_user_id, name, avatar_url, linked_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(kick_user_id) DO UPDATE SET
           name = excluded.name,
           avatar_url = excluded.avatar_url,
           updated_at = excluded.updated_at`,
        profile.kickUserId,
        profile.name,
        profile.avatarUrl,
        now,
        now,
      );
      const bound = await this.session.bindKick(req, profile);
      if (bound.error) return accountError(bound.error, [clearOauth]);
      const cookies: (string | null | undefined)[] = [clearOauth];
      if (bound.cookie) cookies.push(bound.cookie);
      return withCookies(redirect("/account/"), cookies);
    } catch (err) {
      this.logger.error(`kick link save failed: ${(err as Error)?.message || err}`);
      return accountError("store", [clearOauth]);
    }
  }

  async handleKickLogout(req: Request): Promise<HttpResult> {
    if (req.method.toUpperCase() !== "POST") return methodNotAllowed(req.method);
    const csrf = verifyCsrf(req);
    if (!csrf.ok) return forbidden(csrf.error);

    const unlinked = await this.session.unlinkKick(req);
    return withCookies(jsonResponse({ ok: true }), unlinked.clear ? [clearSessionCookie(req)] : []);
  }

  /**
   * GET /api/kick/avatars?names=nick1,nick2,...
   * Returns `{ avatars: Record<lowercaseUsername, siteAvatarUrl> }` for handles
   * that match accounts authorized on this site.
   */
  async handleChatAvatars(req: Request): Promise<HttpResult> {
    const m = req.method.toUpperCase();
    if (m !== "GET" && m !== "HEAD") return methodNotAllowed(req.method);

    const rawNames = searchParams(req).get("names") || "";
    const candidates = rawNames
      .split(",")
      .map(normalizeKickHandle)
      .filter((n) => n.length > 0 && n.length <= 80)
      .slice(0, 150);

    if (candidates.length === 0) {
      const empty = jsonResponse({ avatars: {} });
      return m === "HEAD" ? { ...empty, body: null } : empty;
    }

    const authorized = await loadAuthorizedKickNames(this.db, candidates);
    const avatars: Record<string, string> = {};
    for (const uname of authorized) {
      avatars[uname] = buildLeaderboardAvatarUrl(uname);
    }

    const result = jsonResponse({ avatars });
    return m === "HEAD" ? { ...result, body: null } : result;
  }
}
