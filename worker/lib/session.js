/**
 * One browser session. It can hold a confirmed email, a linked Kick account, or both.
 */
import { randomB64url } from "./crypto.js";
import {
  clearSessionCookie,
  readSessionToken,
  sessionCookie,
  sha256Hex,
} from "./kick.js";

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

function safeToken(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,128}$/.test(value);
}

function personFrom(row) {
  if (!row) return null;
  const verifiedAt = Number(row.email_verified_at) || 0;
  return {
    id: row.person_id,
    email: verifiedAt ? row.email || "" : "",
    emailVerified: Boolean(verifiedAt),
    kickUserId: row.kick_user_id || "",
    name: row.kick_name || "",
    avatarUrl: row.avatar_url || "",
  };
}

export async function loadPerson(request, env) {
  const token = readSessionToken(request);
  if (!safeToken(token)) return { token: "", sessionId: "", person: null };
  const sessionId = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT s.expires_at, s.id AS session_id,
            p.id AS person_id, p.email, p.email_verified_at, p.kick_user_id,
            a.name AS kick_name, a.avatar_url
     FROM site_sessions s
     JOIN site_people p ON p.id = s.person_id
     LEFT JOIN kick_accounts a ON a.kick_user_id = p.kick_user_id
     WHERE s.id = ?`,
  )
    .bind(sessionId)
    .first();
  if (!row) return { token, sessionId, person: null };
  if (Number(row.expires_at) < Date.now()) {
    await env.DB.prepare(`DELETE FROM site_sessions WHERE id = ?`).bind(sessionId).run();
    return { token, sessionId, person: null };
  }
  return { token, sessionId, person: personFrom(row) };
}

async function openSession(env, request, personId) {
  const now = Date.now();
  const token = randomB64url(32);
  const sessionId = await sha256Hex(token);
  await env.DB.prepare(
    `INSERT INTO site_sessions (id, person_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
  )
    .bind(sessionId, personId, now, now + SESSION_MS)
    .run();
  return { token, sessionId, cookie: sessionCookie(token, request) };
}

export async function createPerson(env, request, fields = {}) {
  const now = Date.now();
  const personId = randomB64url(16);
  await env.DB.prepare(
    `INSERT INTO site_people (id, email, email_verified_at, kick_user_id, created_at, updated_at)
     VALUES (?, NULL, NULL, ?, ?, ?)`,
  )
    .bind(personId, fields.kickUserId || null, now, now)
    .run();
  const session = await openSession(env, request, personId);
  return { personId, ...session };
}

export async function bindKick(request, env, profile) {
  const now = Date.now();
  const loaded = await loadPerson(request, env);
  const owner = await env.DB.prepare(
    `SELECT id FROM site_people WHERE kick_user_id = ?`,
  )
    .bind(profile.kickUserId)
    .first();
  const current = loaded.person;

  if (owner && current && owner.id !== current.id && current.emailVerified) {
    return { error: "taken" };
  }

  if (owner && (!current || !current.emailVerified)) {
    if (current && loaded.sessionId && current.id !== owner.id) {
      await env.DB.prepare(`UPDATE site_sessions SET person_id = ? WHERE id = ?`)
        .bind(owner.id, loaded.sessionId)
        .run();
      await env.DB.prepare(`DELETE FROM email_codes WHERE person_id = ?`).bind(current.id).run();
      await env.DB.prepare(`DELETE FROM site_people WHERE id = ?`).bind(current.id).run();
      return { cookie: null };
    }
    if (!current) {
      const session = await openSession(env, request, owner.id);
      return { cookie: session.cookie };
    }
    return { cookie: null };
  }

  if (current) {
    await env.DB.prepare(
      `UPDATE site_people SET kick_user_id = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(profile.kickUserId, now, current.id)
      .run();
    return { cookie: null };
  }

  const created = await createPerson(env, request, { kickUserId: profile.kickUserId });
  return { cookie: created.cookie };
}

export async function unlinkKick(request, env) {
  const loaded = await loadPerson(request, env);
  if (!loaded.person) return { clear: Boolean(loaded.token) };
  const now = Date.now();
  await env.DB.prepare(
    `UPDATE site_people SET kick_user_id = NULL, updated_at = ? WHERE id = ?`,
  )
    .bind(now, loaded.person.id)
    .run();
  if (!loaded.person.emailVerified) {
    await env.DB.prepare(`DELETE FROM site_sessions WHERE id = ?`).bind(loaded.sessionId).run();
    return { clear: true };
  }
  return { clear: false };
}

export async function dropSession(request, env) {
  const loaded = await loadPerson(request, env);
  if (loaded.sessionId && loaded.person) {
    await env.DB.prepare(`DELETE FROM site_sessions WHERE id = ?`).bind(loaded.sessionId).run();
  }
  return { clear: Boolean(loaded.token), cookie: clearSessionCookie(request) };
}

export async function ensurePerson(request, env) {
  const loaded = await loadPerson(request, env);
  if (loaded.person) return { person: loaded.person, cookie: null };
  const created = await createPerson(env, request);
  return {
    person: { id: created.personId, email: "", emailVerified: false, kickUserId: "", name: "", avatarUrl: "" },
    cookie: created.cookie,
  };
}
