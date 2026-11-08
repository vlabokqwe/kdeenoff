/**
 * Link a Kick account to this browser.
 * GET  /api/kick/connect   start Kick login
 * GET  /api/kick/callback  Kick returns here
 * GET  /api/kick/me        current link
 * POST /api/kick/logout    drop the link on this browser
 */
import { timingSafeEqualStr } from "../lib/crypto.js";
import { verifyCsrf } from "../lib/csrf.js";
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
} from "../lib/kick.js";
import { bindKick, loadPerson, unlinkKick } from "../lib/session.js";
import {
  forbidden,
  jsonResponse,
  methodNotAllowed,
  redirect,
  serverError,
} from "../lib/response.js";

const ACCOUNT_ERRORS = new Set(["config", "denied", "state", "token", "profile", "store", "taken"]);

function withCookies(res, cookies) {
  const headers = new Headers(res.headers);
  for (const cookie of cookies) {
    if (cookie) headers.append("set-cookie", cookie);
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function accountError(request, code, cookies = []) {
  const safe = ACCOUNT_ERRORS.has(code) ? code : "token";
  return withCookies(redirect(`/account/?error=${safe}`), cookies);
}

function safeCode(value) {
  return typeof value === "string" && /^[A-Za-z0-9._~-]{8,2048}$/.test(value);
}

function accountPayload(person) {
  if (!person) return { linked: false, name: "", avatarUrl: "", email: "", emailVerified: false };
  return {
    linked: Boolean(person.kickUserId && person.name),
    name: person.name || "",
    avatarUrl: person.avatarUrl || "",
    email: person.email || "",
    emailVerified: Boolean(person.emailVerified),
  };
}

export async function handleKickMe(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed(request.method);
  if (!env.DB) return serverError("Database not configured");

  const loaded = await loadPerson(request, env);
  if (!loaded.person) {
    const body = jsonResponse(accountPayload(null));
    return loaded.token ? withCookies(body, [clearSessionCookie(request)]) : body;
  }
  return jsonResponse(accountPayload(loaded.person));
}

export async function handleKickConnect(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed(request.method);
  if (!kickReady(env)) return accountError(request, "config");
  if (!env.DB) return accountError(request, "store");

  const { state, verifier } = randomOauthPair();
  const challenge = await pkceChallenge(verifier);
  const { id } = kickClient(env);
  const authorize = new URL("https://id.kick.com/oauth/authorize");
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", id);
  authorize.searchParams.set("redirect_uri", kickRedirectUri(request));
  authorize.searchParams.set("scope", "user:read");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");

  return withCookies(redirect(authorize.toString()), [oauthCookie(`${state}.${verifier}`, request)]);
}

export async function handleKickCallback(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed(request.method);

  const url = new URL(request.url);
  const clearOauth = clearOauthCookie(request);
  const kickError = url.searchParams.get("error");
  if (kickError) {
    return accountError(request, kickError === "access_denied" ? "denied" : "token", [clearOauth]);
  }
  if (!kickReady(env)) return accountError(request, "config", [clearOauth]);
  if (!env.DB) return accountError(request, "store", [clearOauth]);

  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const saved = readPackedOauth(request);
  const stateOk =
    safeToken(state) &&
    safeToken(saved.state) &&
    safeToken(saved.verifier) &&
    timingSafeEqualStr(state, saved.state);
  if (!stateOk || !safeCode(code)) return accountError(request, "state", [clearOauth]);

  const { id, secret } = kickClient(env);
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
        redirect_uri: kickRedirectUri(request),
        code,
        code_verifier: saved.verifier,
      }),
    });
    if (!tokenRes.ok) {
      console.error("kick token exchange failed", tokenRes.status);
      return accountError(request, "token", [clearOauth]);
    }
    const tokenBody = await tokenRes.json();
    accessToken = typeof tokenBody.access_token === "string" ? tokenBody.access_token : "";
  } catch {
    console.error("kick token exchange error");
    return accountError(request, "token", [clearOauth]);
  }
  if (!accessToken) return accountError(request, "token", [clearOauth]);

  let profile = null;
  try {
    const userRes = await fetch("https://api.kick.com/public/v1/users", {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
      },
    });
    if (!userRes.ok) {
      console.error("kick profile failed", userRes.status);
      return accountError(request, "profile", [clearOauth]);
    }
    profile = readKickProfile(await userRes.text());
  } catch {
    console.error("kick profile error");
    return accountError(request, "profile", [clearOauth]);
  }
  if (!profile) return accountError(request, "profile", [clearOauth]);

  const now = Date.now();
  try {
    await env.DB.prepare(
      `INSERT INTO kick_accounts (kick_user_id, name, avatar_url, linked_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(kick_user_id) DO UPDATE SET
         name = excluded.name,
         avatar_url = excluded.avatar_url,
         updated_at = excluded.updated_at`,
    )
      .bind(profile.kickUserId, profile.name, profile.avatarUrl, now, now)
      .run();
    const bound = await bindKick(request, env, profile);
    if (bound.error) return accountError(request, bound.error, [clearOauth]);
    const cookies = [clearOauth];
    if (bound.cookie) cookies.push(bound.cookie);
    return withCookies(redirect("/account/"), cookies);
  } catch (err) {
    console.error("kick link save failed", err && err.message);
    return accountError(request, "store", [clearOauth]);
  }
}

export async function handleKickLogout(request, env) {
  if (request.method !== "POST") return methodNotAllowed(request.method);
  const csrf = verifyCsrf(request);
  if (!csrf.ok) return forbidden(csrf.error);
  if (!env.DB) return serverError("Database not configured");

  const unlinked = await unlinkKick(request, env);
  return withCookies(jsonResponse({ ok: true }), unlinked.clear ? [clearSessionCookie(request)] : []);
}
