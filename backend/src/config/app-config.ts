import { Injectable } from "@nestjs/common";

export type TrustProxySetting = boolean | number | string;

/** `TRUST_PROXY`: unset/false/0 -> off, true/1 -> trust all, number -> hops, other text -> express list (e.g. "loopback"). */
export function parseTrustProxy(raw: string | undefined): TrustProxySetting {
  const value = String(raw ?? "").trim();
  if (!value || /^(false|0|no|off)$/i.test(value)) return false;
  if (/^(true|yes|on)$/i.test(value)) return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

export interface AppPaths {
  repoRoot: string;
  databasePath: string;
  migrationsDir: string;
  frontendDist: string;
}

function str(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}

/**
 * Runtime configuration shared by the NestJS server and the Cloudflare Worker.
 * Secrets keep the exact names used in `.env` and Cloudflare Worker bindings/vars.
 */
@Injectable()
export class AppConfig {
  readonly repoRoot: string;
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

  constructor(env: Record<string, unknown> = {}, paths?: AppPaths) {
    const port = Number(env.PORT);
    this.port = Number.isInteger(port) && port > 0 && port < 65536 ? port : 8080;
    this.host = str(env.HOST).trim() || undefined;
    this.nodeEnv = str(env.NODE_ENV).trim() || "development";
    this.isProduction = this.nodeEnv === "production";
    this.repoRoot = paths?.repoRoot ?? "";
    this.databasePath = paths?.databasePath ?? "";
    this.migrationsDir = paths?.migrationsDir ?? "";
    this.frontendDist = paths?.frontendDist ?? "";
    this.trustProxy = parseTrustProxy(str(env.TRUST_PROXY) || undefined);

    this.siteLabel = str(env.SITE_LABEL).trim() || "kdeenoff";
    this.promoCode = str(env.PROMO_CODE).trim() || "KDEENOFF";
    this.KICK_CLIENT_ID = str(env.KICK_CLIENT_ID);
    this.KICK_CLIENT_SECRET = str(env.KICK_CLIENT_SECRET);
    this.RESEND_API_KEY = str(env.RESEND_API_KEY);
    this.CF_ACCESS_TEAM_DOMAIN = str(env.CF_ACCESS_TEAM_DOMAIN);
    this.CF_ACCESS_AUD = str(env.CF_ACCESS_AUD);
    this.ADMIN_EMAILS = str(env.ADMIN_EMAILS);
    this.ADMIN_KICK_USERS = str(env.ADMIN_KICK_USERS);
    this.STREAMER_EMAILS = str(env.STREAMER_EMAILS);
    this.STREAMER_KICK_USERS = str(env.STREAMER_KICK_USERS);
  }
}
