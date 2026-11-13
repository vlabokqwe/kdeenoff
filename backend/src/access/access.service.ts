/**
 * Cloudflare Access gate for /admin and /api/admin.
 *
 * Cloudflare Access sits in front of those paths and adds a signed JWT
 * (header Cf-Access-Jwt-Assertion, cookie CF_Authorization). The server checks it
 * again here, so a misconfigured or bypassed Access policy still cannot reach the admin.
 *
 * Config (env):
 *   CF_ACCESS_TEAM_DOMAIN  e.g. "myteam.cloudflareaccess.com"
 *   CF_ACCESS_AUD          Application Audience (AUD) tag of the Access app
 *
 * Without config the admin is closed (fail closed). A local preview (see isLocalDevRequest)
 * is let through.
 */
import { Injectable, Logger } from "@nestjs/common";
import type { Request } from "express";
import type { webcrypto } from "node:crypto";
import { AppConfig } from "../config/app-config";
import type { Actor } from "../audit/audit.module";
import { cookieHeader, readCookie } from "../common/cookies";
import { b64urlToBytes } from "../common/crypto";
import { isLocalDevRequest } from "../common/http/request";
import { SessionService, type UserRole } from "../session/session.service";

const JWKS_TTL_MS = 10 * 60 * 1000;
const CLOCK_SKEW_S = 60;

export type AdminGate = { ok: true; actor: Actor } | { ok: false; status: number; error: string };

function parseCsvLower(raw: string | undefined): Set<string> {
  const out = new Set<string>();
  for (const part of String(raw || "").split(",")) {
    const clean = part.trim().toLowerCase();
    if (clean) out.add(clean);
  }
  return out;
}

/** Normalize the way an asset server might (%-escapes, repeated slashes, case). */
export function isAdminPath(pathname: string, prefix: string): boolean {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return true;
  }
  const lower = path.replace(/\\/g, "/").replace(/\/{2,}/g, "/").toLowerCase();
  return lower === prefix || lower.startsWith(`${prefix}/`) || lower.startsWith(`${prefix}.`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

@Injectable()
export class AccessService {
  private readonly logger = new Logger("Access");
  private jwksCache: { domain: string; at: number; keys: Map<string, webcrypto.CryptoKey> } = {
    domain: "",
    at: 0,
    keys: new Map(),
  };

  private readonly adminEmails: Set<string>;
  private readonly adminKickUsers: Set<string>;
  private readonly streamerEmails: Set<string>;
  private readonly streamerKickUsers: Set<string>;

  constructor(
    private readonly config: AppConfig,
    private readonly session: SessionService,
  ) {
    this.adminEmails = parseCsvLower(this.config.ADMIN_EMAILS);
    this.adminKickUsers = parseCsvLower(this.config.ADMIN_KICK_USERS);
    this.streamerEmails = parseCsvLower(this.config.STREAMER_EMAILS);
    this.streamerKickUsers = parseCsvLower(this.config.STREAMER_KICK_USERS);
  }

  private allowlistConfigured(): boolean {
    return this.adminEmails.size > 0 || this.adminKickUsers.size > 0;
  }

  private streamerAllowlistConfigured(): boolean {
    return (
      this.allowlistConfigured() ||
      this.streamerEmails.size > 0 ||
      this.streamerKickUsers.size > 0
    );
  }

  private actorEmailForPerson(person: {
    email: string | null;
    emailVerified: boolean;
    kickUserId: string | null;
    name: string | null;
  }): string {
    if (person.emailVerified && person.email) {
      return person.email.slice(0, 200);
    }
    if (person.kickUserId) {
      return `kick:${(person.name || person.kickUserId).slice(0, 180)}`;
    }
    return "session-user";
  }

  private checkSessionAllowlist(req: Request): Actor | null {
    const { person } = this.session.loadPerson(req);
    if (!person) return null;
    const verifiedIdentity = Boolean(person.emailVerified || person.kickUserId);
    if (verifiedIdentity && person.role === "admin") {
      return { sub: 1, email: this.actorEmailForPerson(person) };
    }
    if (!this.allowlistConfigured()) return null;
    if (person.emailVerified && person.email && this.adminEmails.has(person.email.toLowerCase())) {
      return { sub: 1, email: person.email.slice(0, 200) };
    }
    if (person.kickUserId) {
      const kickId = person.kickUserId.toLowerCase();
      const kickName = (person.name || "").toLowerCase();
      if (this.adminKickUsers.has(kickId) || (kickName && this.adminKickUsers.has(kickName))) {
        return { sub: 1, email: person.email || `kick:${person.name || person.kickUserId}` };
      }
    }
    return null;
  }

  private checkSessionStreamer(req: Request): Actor | null {
    const adminActor = this.checkSessionAllowlist(req);
    if (adminActor) return adminActor;

    const { person } = this.session.loadPerson(req);
    if (!person) return null;
    const verifiedIdentity = Boolean(person.emailVerified || person.kickUserId);
    if (verifiedIdentity && person.role === "streamer") {
      return { sub: 1, email: this.actorEmailForPerson(person) };
    }
    if (this.streamerEmails.size > 0 && person.emailVerified && person.email) {
      if (this.streamerEmails.has(person.email.toLowerCase())) {
        return { sub: 1, email: person.email.slice(0, 200) };
      }
    }
    if (this.streamerKickUsers.size > 0 && person.kickUserId) {
      const kickId = person.kickUserId.toLowerCase();
      const kickName = (person.name || "").toLowerCase();
      if (this.streamerKickUsers.has(kickId) || (kickName && this.streamerKickUsers.has(kickName))) {
        return { sub: 1, email: person.email || `kick:${person.name || person.kickUserId}` };
      }
    }
    return null;
  }

  private teamDomain(): string {
    const raw = String(this.config.CF_ACCESS_TEAM_DOMAIN || "").trim().toLowerCase();
    const host = raw.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    return /^[a-z0-9-]+\.cloudflareaccess\.com$/.test(host) ? host : "";
  }

  private audience(): string {
    const aud = String(this.config.CF_ACCESS_AUD || "").trim();
    return /^[A-Za-z0-9]{16,128}$/.test(aud) ? aud : "";
  }

  accessConfigured(): boolean {
    return Boolean(this.teamDomain() && this.audience());
  }

  private async signingKey(domain: string, kid: string): Promise<webcrypto.CryptoKey | null> {
    const cache = this.jwksCache;
    const fresh = cache.domain === domain && Date.now() - cache.at < JWKS_TTL_MS;
    if (!fresh || !cache.keys.has(kid)) {
      const res = await fetch(`https://${domain}/cdn-cgi/access/certs`, {
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw new Error(`certs ${res.status}`);
      const body: Json = await res.json();
      const keys = new Map<string, webcrypto.CryptoKey>();
      for (const jwk of Array.isArray(body.keys) ? body.keys : []) {
        if (jwk.kty !== "RSA" || !jwk.kid) continue;
        const key = await crypto.subtle.importKey(
          "jwk",
          { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
          { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
          false,
          ["verify"],
        );
        keys.set(jwk.kid, key);
      }
      this.jwksCache = { domain, at: Date.now(), keys };
    }
    return this.jwksCache.keys.get(kid) || null;
  }

  private decodePart(part: string): Json {
    return JSON.parse(new TextDecoder().decode(b64urlToBytes(part)));
  }

  private async verifyJwt(token: string): Promise<Json | null> {
    const domain = this.teamDomain();
    const aud = this.audience();
    const parts = String(token || "").split(".");
    if (parts.length !== 3 || token.length > 8192) return null;

    let header: Json;
    let payload: Json;
    try {
      header = this.decodePart(parts[0]);
      payload = this.decodePart(parts[1]);
    } catch {
      return null;
    }
    if (!header || !payload) return null;
    if (header.alg !== "RS256" || typeof header.kid !== "string") return null;

    const key = await this.signingKey(domain, header.kid);
    if (!key) return null;
    let signature: Uint8Array;
    try {
      signature = b64urlToBytes(parts[2]);
    } catch {
      return null;
    }
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      signature,
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!ok) return null;

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp + CLOCK_SKEW_S < now) return null;
    if (typeof payload.nbf === "number" && payload.nbf - CLOCK_SKEW_S > now) return null;
    if (payload.iss !== `https://${domain}`) return null;
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(aud)) return null;
    return payload;
  }

  async requireAdmin(req: Request): Promise<AdminGate> {
    if (this.accessConfigured()) {
      const token = req.get("cf-access-jwt-assertion") || readCookie(cookieHeader(req), "CF_Authorization");
      if (token) {
        let payload: Json = null;
        try {
          payload = await this.verifyJwt(token);
        } catch (err) {
          this.logger.error(`access verify failed ${(err as Error)?.message}`);
          return { ok: false, status: 503, error: "Access check failed" };
        }
        if (!payload) return { ok: false, status: 403, error: "Forbidden" };
        const email = typeof payload.email === "string" ? payload.email.slice(0, 200) : "service-token";
        return { ok: true, actor: { sub: 1, email } };
      }
    }

    const allowlisted = this.checkSessionAllowlist(req);
    if (allowlisted) {
      return { ok: true, actor: allowlisted };
    }

    if (!this.accessConfigured() && isLocalDevRequest(req, this.config.isProduction)) {
      const { person } = this.session.loadPerson(req);
      if (person && (person.emailVerified || person.kickUserId) && person.role !== "admin") {
        return { ok: false, status: 403, error: "Forbidden" };
      }
      const email =
        (person?.emailVerified && person?.email) ||
        (person?.name ? `kick:${person.name}` : "local-admin");
      return { ok: true, actor: { sub: 1, email } };
    }

    const { person } = this.session.loadPerson(req);
    if (person && (person.emailVerified || person.kickUserId)) {
      return { ok: false, status: 403, error: "Forbidden" };
    }

    if (!this.accessConfigured() && !this.allowlistConfigured()) {
      return { ok: false, status: 401, error: "Unauthorized" };
    }

    return { ok: false, status: 401, error: "Unauthorized" };
  }

  async requireStreamer(req: Request): Promise<AdminGate> {
    const streamerActor = this.checkSessionStreamer(req);
    if (streamerActor) {
      return { ok: true, actor: streamerActor };
    }

    const adminGate = await this.requireAdmin(req);
    if (adminGate.ok) return adminGate;

    if (!this.accessConfigured() && !this.streamerAllowlistConfigured()) {
      const { person } = this.session.loadPerson(req);
      if (person && (person.emailVerified || person.kickUserId)) {
        return { ok: false, status: 403, error: "Forbidden" };
      }
      return { ok: false, status: 401, error: "Unauthorized" };
    }

    return adminGate;
  }

  async resolveAccountRoles(
    req: Request,
  ): Promise<{ role: UserRole; isAdmin: boolean; isStreamer: boolean }> {
    const { person } = this.session.loadPerson(req);
    if (!person || (!person.emailVerified && !person.kickUserId)) {
      return { role: "player", isAdmin: false, isStreamer: false };
    }
    const adminGate = await this.requireAdmin(req);
    if (adminGate.ok) {
      return { role: "admin", isAdmin: true, isStreamer: true };
    }
    const streamerGate = await this.requireStreamer(req);
    if (streamerGate.ok) {
      return { role: "streamer", isAdmin: false, isStreamer: true };
    }
    return { role: "player", isAdmin: false, isStreamer: false };
  }
}
