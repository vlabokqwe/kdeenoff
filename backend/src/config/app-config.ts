import { Injectable } from "@nestjs/common";
import { isAbsolute, join, resolve } from "node:path";
import { REPO_ROOT, loadEnvFile } from "./paths";

export type TrustProxySetting = boolean | number | string;

/** `TRUST_PROXY`: unset/false/0 -> off, true/1 -> trust all, number -> hops, other text -> express list (e.g. "loopback"). */
export function parseTrustProxy(raw: string | undefined): TrustProxySetting {
  const value = String(raw ?? "").trim();
  if (!value || /^(false|0|no|off)$/i.test(value)) return false;
  if (/^(true|yes|on)$/i.test(value)) return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

function fromRoot(value: string | undefined, fallback: string): string {
  const v = String(value ?? "").trim() || fallback;
  return isAbsolute(v) ? v : resolve(REPO_ROOT, v);
}

/**
 * Process configuration, read once from the environment (and the repo-root `.env`).
 * Secrets keep the same names as the old Worker vars.
 */
@Injectable()
export class AppConfig {
  readonly repoRoot = REPO_ROOT;
  readonly port: number;
  readonly host: string | undefined;
  readonly nodeEnv: string;
  readonly isProduction: boolean;
  readonly databasePath: string;
  readonly migrationsDir: string;
  readonly frontendDist: string;
  readonly trustProxy: TrustProxySetting;

  readonly siteLabel: string;
  readonly promoCode: string;
  readonly KICK_CLIENT_ID: string;
  readonly KICK_CLIENT_SECRET: string;
  readonly RESEND_API_KEY: string;
  readonly CF_ACCESS_TEAM_DOMAIN: string;
  readonly CF_ACCESS_AUD: string;
  readonly ADMIN_EMAILS: string;
  readonly ADMIN_KICK_USERS: string;
  readonly STREAMER_EMAILS: string;
  readonly STREAMER_KICK_USERS: string;

  constructor() {
    loadEnvFile();
    const env = process.env;
    const port = Number(env.PORT);
    this.port = Number.isInteger(port) && port > 0 && port < 65536 ? port : 8080;
    this.host = String(env.HOST || "").trim() || undefined;
    this.nodeEnv = String(env.NODE_ENV || "development");
    this.isProduction = this.nodeEnv === "production";
    this.databasePath = fromRoot(env.DATABASE_PATH, join("data", "kdeenoff.sqlite"));
    this.migrationsDir = join(REPO_ROOT, "migrations");
    this.frontendDist = fromRoot(env.FRONTEND_DIST, join("frontend", "dist"));
    this.trustProxy = parseTrustProxy(env.TRUST_PROXY);

    this.siteLabel = String(env.SITE_LABEL || "kdeenoff");
    this.promoCode = String(env.PROMO_CODE || "KDEENOFF");
    this.KICK_CLIENT_ID = String(env.KICK_CLIENT_ID || "");
    this.KICK_CLIENT_SECRET = String(env.KICK_CLIENT_SECRET || "");
    this.RESEND_API_KEY = String(env.RESEND_API_KEY || "");
    this.CF_ACCESS_TEAM_DOMAIN = String(env.CF_ACCESS_TEAM_DOMAIN || "");
    this.CF_ACCESS_AUD = String(env.CF_ACCESS_AUD || "");
    this.ADMIN_EMAILS = String(env.ADMIN_EMAILS || "");
    this.ADMIN_KICK_USERS = String(env.ADMIN_KICK_USERS || "");
    this.STREAMER_EMAILS = String(env.STREAMER_EMAILS || "");
    this.STREAMER_KICK_USERS = String(env.STREAMER_KICK_USERS || "");
  }
}
