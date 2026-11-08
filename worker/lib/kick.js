/**
 * Kick OAuth helpers. Identity is the numeric user_id from Kick, kept as text
 * so a large id is not rounded by JSON. Email is ignored.
 */
import { b64urlFromBytes, randomB64url } from "./crypto.js";
import { buildCookie, readCookie } from "./cookies.js";

export const KICK_SESSION_COOKIE = "kdeenoff_kick";
export const KICK_OAUTH_COOKIE = "kdeenoff_kick_oauth";

const SESSION_SECONDS = 30 * 24 * 60 * 60;
const OAUTH_SECONDS = 10 * 60;

export function kickReady(env) {
  const id = String(env?.KICK_CLIENT_ID || "").trim();
  const secret = String(env?.KICK_CLIENT_SECRET || "").trim();
  if (!id || !secret) return false;
  if (id.length > 200 || secret.length > 200) return false;
  if (/[\r\n]/.test(id) || /[\r\n]/.test(secret)) return false;
  return true;
}

export function kickClient(env) {
  return {
    id: String(env.KICK_CLIENT_ID).trim(),
    secret: String(env.KICK_CLIENT_SECRET).trim(),
  };
}

export function kickRedirectUri(request) {
  const url = new URL(request.url);
  return `${url.origin}/api/kick/callback`;
}

export function randomOauthPair() {
  return {
    state: randomB64url(16),
    verifier: randomB64url(32),
  };
}

export async function pkceChallenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64urlFromBytes(new Uint8Array(digest));
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

export function oauthCookie(packed, request) {
  return buildCookie(KICK_OAUTH_COOKIE, packed, request, {
    maxAge: OAUTH_SECONDS,
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
  });
}

export function clearOauthCookie(request) {
  return buildCookie(KICK_OAUTH_COOKIE, "", request, {
    maxAge: 0,
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
  });
}

export function sessionCookie(token, request) {
  return buildCookie(KICK_SESSION_COOKIE, token, request, {
    maxAge: SESSION_SECONDS,
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
  });
}

export function clearSessionCookie(request) {
  return buildCookie(KICK_SESSION_COOKIE, "", request, {
    maxAge: 0,
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
  });
}

export function readPackedOauth(request) {
  const packed = readCookie(request.headers.get("cookie"), KICK_OAUTH_COOKIE) || "";
  const dot = packed.indexOf(".");
  if (dot < 1) return { state: "", verifier: "" };
  return { state: packed.slice(0, dot), verifier: packed.slice(dot + 1) };
}

export function readSessionToken(request) {
  return readCookie(request.headers.get("cookie"), KICK_SESSION_COOKIE) || "";
}

export function cleanKickName(value) {
  const name = String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!name) return "";
  return name.slice(0, 40);
}

export function cleanKickAvatar(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.username || url.password) return "";
    const href = url.toString();
    return href.length <= 500 ? href : "";
  } catch {
    return "";
  }
}

export function readKickProfile(text) {
  const source = String(text || "");
  const slice = source.includes('"data"') ? source.slice(source.indexOf('"data"')) : source;
  const idMatch = slice.match(/"user_id"\s*:\s*"?(\d{1,20})"?/);
  const kickUserId = idMatch ? idMatch[1] : "";
  let parsed;
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
