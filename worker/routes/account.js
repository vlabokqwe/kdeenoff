/**
 * Email confirmation codes, sent through Resend.
 * POST /api/account/email          send a code
 * POST /api/account/email/confirm  check the code
 * POST /api/account/logout         forget this browser
 */
import { timingSafeEqualStr, randomB64url } from "../lib/crypto.js";
import { verifyCsrf } from "../lib/csrf.js";
import { sha256Hex } from "../lib/kick.js";
import { codeEmailHtml, codeEmailText } from "../lib/code-email.js";
import { dropSession, ensurePerson, loadPerson } from "../lib/session.js";
import { isValidEmail, normalizeEmail, readBody } from "../lib/validation.js";
import {
  forbidden,
  jsonResponse,
  methodNotAllowed,
  serverError,
} from "../lib/response.js";

const CODE_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const HOUR_CAP = 5;
const MAX_ATTEMPTS = 5;
const FROM = "KDeenOff <noreply@kdeenoff.bet>";

function withCookies(res, cookies) {
  const headers = new Headers(res.headers);
  for (const cookie of cookies) {
    if (cookie) headers.append("set-cookie", cookie);
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function fail(code, status, cookie) {
  return withCookies(jsonResponse({ error: code }, status), cookie ? [cookie] : []);
}

function sixDigit() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, "0");
}

async function codeHash(salt, code) {
  return sha256Hex(`${salt}:${code}`);
}

function resendReady(env) {
  const key = String(env?.RESEND_API_KEY || "").trim();
  return key && key.length < 200 && !/[\r\n]/.test(key);
}

export async function handleAccountEmail(request, env) {
  if (request.method !== "POST") return methodNotAllowed(request.method);
  const csrf = verifyCsrf(request);
  if (!csrf.ok) return forbidden(csrf.error);
  if (!env.DB) return serverError("Database not configured");

  const body = await readBody(request);
  const email = normalizeEmail(body && body.email);
  if (!isValidEmail(email)) return fail("email", 400);
  if (!resendReady(env)) return fail("config", 503);

  const existing = await loadPerson(request, env);
  const taken = await env.DB.prepare(
    `SELECT id FROM site_people WHERE email = ? AND email_verified_at IS NOT NULL`,
  )
    .bind(email)
    .first();
  if (taken && (!existing.person || taken.id !== existing.person.id)) return fail("taken", 409);

  let ensured;
  try {
    ensured = existing.person
      ? { person: existing.person, cookie: null }
      : await ensurePerson(request, env);
  } catch (err) {
    console.error("email session failed", err && err.message);
    return fail("store", 500);
  }
  const person = ensured.person;
  const cookie = ensured.cookie;

  const now = Date.now();
  const latest = await env.DB.prepare(
    `SELECT created_at FROM email_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(email)
    .first();
  if (latest && now - Number(latest.created_at) < COOLDOWN_MS) return fail("wait", 429, cookie);

  const hour = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM email_codes WHERE email = ? AND created_at > ?`,
  )
    .bind(email, now - HOUR_MS)
    .first();
  if (Number(hour && hour.n) >= HOUR_CAP) return fail("limit", 429, cookie);

  const code = sixDigit();
  const salt = randomB64url(16);
  const hash = await codeHash(salt, code);
  await env.DB.prepare(`DELETE FROM email_codes WHERE created_at < ?`).bind(now - 24 * HOUR_MS).run();
  await env.DB.prepare(
    `INSERT INTO email_codes (person_id, email, code_hash, salt, expires_at, attempts, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
  )
    .bind(person.id, email, hash, salt, now + CODE_MS, now)
    .run();

  try {
    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${String(env.RESEND_API_KEY).trim()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [email],
        subject: "Your KDeenOff code",
        text: codeEmailText(code),
        html: codeEmailHtml(code),
      }),
    });
    if (!sent.ok) {
      console.error("resend send failed", sent.status);
      await env.DB.prepare(`DELETE FROM email_codes WHERE person_id = ? AND created_at = ?`)
        .bind(person.id, now)
        .run();
      return fail("send", 502, cookie);
    }
  } catch (err) {
    console.error("resend send error", err && err.message);
    await env.DB.prepare(`DELETE FROM email_codes WHERE person_id = ? AND created_at = ?`)
      .bind(person.id, now)
      .run();
    return fail("send", 502, cookie);
  }

  return withCookies(jsonResponse({ ok: true }), cookie ? [cookie] : []);
}

export async function handleAccountEmailConfirm(request, env) {
  if (request.method !== "POST") return methodNotAllowed(request.method);
  const csrf = verifyCsrf(request);
  if (!csrf.ok) return forbidden(csrf.error);
  if (!env.DB) return serverError("Database not configured");

  const body = await readBody(request);
  const code = String(body && body.code || "").trim();
  if (!/^\d{6}$/.test(code)) return fail("bad", 400);

  const loaded = await loadPerson(request, env);
  if (!loaded.person) return fail("expired", 400);

  const row = await env.DB.prepare(
    `SELECT id, email, code_hash, salt, expires_at, attempts
     FROM email_codes WHERE person_id = ? ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(loaded.person.id)
    .first();
  if (!row) return fail("expired", 400);
  if (Number(row.expires_at) < Date.now() || Number(row.attempts) >= MAX_ATTEMPTS) {
    await env.DB.prepare(`DELETE FROM email_codes WHERE id = ?`).bind(row.id).run();
    return fail("expired", 400);
  }

  const hash = await codeHash(row.salt, code);
  if (!timingSafeEqualStr(hash, row.code_hash)) {
    await env.DB.prepare(`UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?`).bind(row.id).run();
    return fail("bad", 400);
  }

  const now = Date.now();
  try {
    await env.DB.prepare(
      `UPDATE site_people SET email = ?, email_verified_at = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(row.email, now, now, loaded.person.id)
      .run();
  } catch (err) {
    console.error("email confirm failed", err && err.message);
    return fail("taken", 409);
  }
  await env.DB.prepare(`DELETE FROM email_codes WHERE person_id = ?`).bind(loaded.person.id).run();
  return jsonResponse({ ok: true, email: row.email });
}

export async function handleAccountLogout(request, env) {
  if (request.method !== "POST") return methodNotAllowed(request.method);
  const csrf = verifyCsrf(request);
  if (!csrf.ok) return forbidden(csrf.error);
  if (!env.DB) return serverError("Database not configured");
  const dropped = await dropSession(request, env);
  return withCookies(jsonResponse({ ok: true }), dropped.clear ? [dropped.cookie] : []);
}
