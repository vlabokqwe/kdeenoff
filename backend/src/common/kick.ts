/**
 * Kick OAuth helpers. Identity is the numeric user_id from Kick, kept as text
 * so a large id is not rounded by JSON. Email is ignored.
 */
import type { Request } from "express";
import type { AppConfig } from "../config/app-config";
import { buildCookie, cookieHeader, readCookie } from "./cookies";
import { randomB64url, sha256B64url } from "./crypto";
import { publicOrigin } from "./http/request";

export { sha256Hex } from "./crypto";

export const KICK_SESSION_COOKIE = "kdeenoff_kick";
export const KICK_OAUTH_COOKIE = "kdeenoff_kick_oauth";

const SESSION_SECONDS = 30 * 24 * 60 * 60;
const OAUTH_SECONDS = 10 * 60;

export interface KickProfile {
  kickUserId: string;
  name: string;
  avatarUrl: string;
}

export function kickReady(config: Pick<AppConfig, "KICK_CLIENT_ID" | "KICK_CLIENT_SECRET">): boolean {
  const id = String(config?.KICK_CLIENT_ID || "").trim();
  const secret = String(config?.KICK_CLIENT_SECRET || "").trim();
  if (!id || !secret) return false;
  if (id.length > 200 || secret.length > 200) return false;
  if (/[\r\n]/.test(id) || /[\r\n]/.test(secret)) return false;
  return true;
}

export function kickClient(config: Pick<AppConfig, "KICK_CLIENT_ID" | "KICK_CLIENT_SECRET">): {
  id: string;
  secret: string;
} {
  return {
    id: String(config.KICK_CLIENT_ID).trim(),
    secret: String(config.KICK_CLIENT_SECRET).trim(),
  };
}

export function kickRedirectUri(req: Request): string {
  return `${publicOrigin(req)}/api/kick/callback`;
}

export function randomOauthPair(): { state: string; verifier: string } {
  return {
    state: randomB64url(16),
    verifier: randomB64url(32),
  };
}

export function pkceChallenge(verifier: string): string {
  return sha256B64url(verifier);
}

export function oauthCookie(packed: string, req: Request): string {
  return buildCookie(KICK_OAUTH_COOKIE, packed, req, {
    maxAge: OAUTH_SECONDS,
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
  });
}

export function clearOauthCookie(req: Request): string {
  return buildCookie(KICK_OAUTH_COOKIE, "", req, {
    maxAge: 0,
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
  });
}

export function sessionCookie(token: string, req: Request): string {
  return buildCookie(KICK_SESSION_COOKIE, token, req, {
    maxAge: SESSION_SECONDS,
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
  });
}

export function clearSessionCookie(req: Request): string {
  return buildCookie(KICK_SESSION_COOKIE, "", req, {
    maxAge: 0,
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
  });
}

export function readPackedOauth(req: Request): { state: string; verifier: string } {
  const packed = readCookie(cookieHeader(req), KICK_OAUTH_COOKIE) || "";
  const dot = packed.indexOf(".");
  if (dot < 1) return { state: "", verifier: "" };
  return { state: packed.slice(0, dot), verifier: packed.slice(dot + 1) };
}

export function readSessionToken(req: Request): string {
  return readCookie(cookieHeader(req), KICK_SESSION_COOKIE) || "";
}

export function cleanKickName(value: unknown): string {
  // eslint-disable-next-line no-control-regex
  const name = String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!name) return "";
  return name.slice(0, 40);
}

export function cleanKickAvatar(value: unknown): string {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.username || url.password) return "";
    const href = url.toString();
    return href.length <= 500 ? href : "";
  } catch {
    return "";
  }
}

export function readKickProfile(text: unknown): KickProfile | null {
  const source = String(text || "");
  const slice = source.includes('"data"') ? source.slice(source.indexOf('"data"')) : source;
  const idMatch = slice.match(/"user_id"\s*:\s*"?(\d{1,20})"?/);
  const kickUserId = idMatch ? idMatch[1] : "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;
  try {
    parsed = JSON.parse(source);
  } catch {
    return null;
  }
  const data = parsed && parsed.data;
  const user = Array.isArray(data) ? data[0] : data;
  if (!user || typeof user !== "object") return null;
  const name = cleanKickName(user.name || user.username || "");
  if (!kickUserId || !name) return null;
  return {
    kickUserId,
    name,
    avatarUrl: cleanKickAvatar(user.profile_picture || user.profilePicture || ""),
  };
}
