/**
 * One browser session. It can hold a confirmed email, a linked Kick account, or both.
 */
import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { randomB64url, sha256Hex } from "../common/crypto";
import {
  type KickProfile,
  clearSessionCookie,
  readSessionToken,
  sessionCookie,
} from "../common/kick";
import { DatabaseService, type Row } from "../database/database.service";

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export type UserRole = "player" | "streamer" | "admin";

export function normalizeUserRole(raw: unknown): UserRole {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "admin") return "admin";
  if (s === "streamer") return "streamer";
  return "player";
}

export interface Person {
  id: string;
  email: string;
  emailVerified: boolean;
  partnerUsername: string;
  kickUserId: string;
  name: string;
  avatarUrl: string;
  role: UserRole;
}

export interface LoadedSession {
  token: string;
  sessionId: string;
  person: Person | null;
}

function safeToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,128}$/.test(value);
}

function personFrom(row: Row | null): Person | null {
  if (!row) return null;
  const verifiedAt = Number(row.email_verified_at) || 0;
  return {
    id: String(row.person_id),
    email: verifiedAt ? String(row.email || "") : "",
    emailVerified: Boolean(verifiedAt),
    partnerUsername: String(row.partner_username || "").trim(),
    kickUserId: String(row.kick_user_id || ""),
    name: String(row.kick_name || ""),
    avatarUrl: String(row.avatar_url || ""),
    role: normalizeUserRole(row.role),
  };
}

@Injectable()
export class SessionService {
  constructor(private readonly db: DatabaseService) { }

  loadPerson(req: Request): LoadedSession {
    const token = readSessionToken(req);
    if (!safeToken(token)) return { token: "", sessionId: "", person: null };
    const sessionId = sha256Hex(token);
    const row = this.db.first(
      `SELECT s.expires_at, s.id AS session_id,
              p.id AS person_id, p.email, p.email_verified_at, p.kick_user_id, p.role,
              COALESCE(NULLIF(TRIM(p.partner_username), ''), NULLIF(TRIM(a.partner_username), ''), '') AS partner_username,
              a.name AS kick_name, a.avatar_url
       FROM site_sessions s
       JOIN site_people p ON p.id = s.person_id
       LEFT JOIN kick_accounts a ON a.kick_user_id = p.kick_user_id
       WHERE s.id = ?`,
      sessionId,
    );
    if (!row) return { token, sessionId, person: null };
    if (Number(row.expires_at) < Date.now()) {
      this.db.run(`DELETE FROM site_sessions WHERE id = ?`, sessionId);
      return { token, sessionId, person: null };
    }
    return { token, sessionId, person: personFrom(row) };
  }

  /** Linked Kick account for this session, or null. */
  kickPerson(req: Request): Person | null {
    const loaded = this.loadPerson(req);
    const person = loaded.person;
    if (!person || !person.kickUserId || !person.name) return null;
    return person;
  }

  private openSession(
    req: Request,
    personId: string,
  ): { token: string; sessionId: string; cookie: string } {
    const now = Date.now();
    const token = randomB64url(32);
    const sessionId = sha256Hex(token);
    this.db.run(
      `INSERT INTO site_sessions (id, person_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
      sessionId,
      personId,
      now,
      now + SESSION_MS,
    );
    return { token, sessionId, cookie: sessionCookie(token, req) };
  }

  createPerson(
    req: Request,
    fields: { kickUserId?: string | null } = {},
  ): { personId: string; token: string; sessionId: string; cookie: string } {
    const now = Date.now();
    const personId = randomB64url(16);
    this.db.run(
      `INSERT INTO site_people (id, email, email_verified_at, kick_user_id, created_at, updated_at)
       VALUES (?, NULL, NULL, ?, ?, ?)`,
      personId,
      fields.kickUserId || null,
      now,
      now,
    );
    const session = this.openSession(req, personId);
    return { personId, ...session };
  }

  bindKick(
    req: Request,
    profile: KickProfile,
  ): { error?: string; cookie?: string | null } {
    const now = Date.now();
    const loaded = this.loadPerson(req);
    const owner = this.db.first<{ id: string }>(
      `SELECT id FROM site_people WHERE kick_user_id = ?`,
      profile.kickUserId,
    );
    const current = loaded.person;

    if (owner && current && owner.id !== current.id && current.emailVerified) {
      return { error: "taken" };
    }

    if (owner && (!current || !current.emailVerified)) {
      if (current && loaded.sessionId && current.id !== owner.id) {
        const stmts = [
          this.db.stmt(`UPDATE site_sessions SET person_id = ? WHERE id = ?`, owner.id, loaded.sessionId),
        ];
        if (current.partnerUsername) {
          stmts.push(
            this.db.stmt(
              `UPDATE site_people
               SET partner_username = COALESCE(NULLIF(TRIM(partner_username), ''), ?), updated_at = ?
               WHERE id = ?`,
              current.partnerUsername,
              now,
              owner.id,
            ),
            this.db.stmt(
              `UPDATE kick_accounts
               SET partner_username = COALESCE(NULLIF(TRIM(partner_username), ''), ?), updated_at = ?
               WHERE kick_user_id = ?`,
              current.partnerUsername,
              now,
              profile.kickUserId,
            ),
          );
        }
        stmts.push(
          this.db.stmt(`DELETE FROM email_codes WHERE person_id = ?`, current.id),
          this.db.stmt(`DELETE FROM site_people WHERE id = ?`, current.id),
        );
        this.db.batch(stmts);
        return { cookie: null };
      }
      if (!current) {
        const session = this.openSession(req, owner.id);
        return { cookie: session.cookie };
      }
      return { cookie: null };
    }

    if (current) {
      if (current.partnerUsername) {
        this.db.batch([
          this.db.stmt(
            `UPDATE site_people SET kick_user_id = ?, updated_at = ? WHERE id = ?`,
            profile.kickUserId,
            now,
            current.id,
          ),
          this.db.stmt(
            `UPDATE kick_accounts SET partner_username = ?, updated_at = ? WHERE kick_user_id = ?`,
            current.partnerUsername,
            now,
            profile.kickUserId,
          ),
        ]);
      } else {
        this.db.run(
          `UPDATE site_people SET kick_user_id = ?, updated_at = ? WHERE id = ?`,
          profile.kickUserId,
          now,
          current.id,
        );
      }
      return { cookie: null };
    }

    const created = this.createPerson(req, { kickUserId: profile.kickUserId });
    return { cookie: created.cookie };
  }

  unlinkKick(req: Request): { clear: boolean } {
    const loaded = this.loadPerson(req);
    if (!loaded.person) return { clear: Boolean(loaded.token) };
    const now = Date.now();
    this.db.run(
      `UPDATE site_people SET kick_user_id = NULL, updated_at = ? WHERE id = ?`,
      now,
      loaded.person.id,
    );
    if (!loaded.person.emailVerified) {
      this.db.run(`DELETE FROM site_sessions WHERE id = ?`, loaded.sessionId);
      return { clear: true };
    }
    return { clear: false };
  }

  dropSession(req: Request): { clear: boolean; cookie: string } {
    const loaded = this.loadPerson(req);
    if (loaded.sessionId && loaded.person) {
      this.db.run(`DELETE FROM site_sessions WHERE id = ?`, loaded.sessionId);
    }
    return { clear: Boolean(loaded.token), cookie: clearSessionCookie(req) };
  }

  adoptPerson(req: Request, personId: string): { cookie: string | null } {
    const loaded = this.loadPerson(req);
    if (loaded.person && loaded.person.id === personId) return { cookie: null };
    if (loaded.sessionId) {
      this.db.run(`DELETE FROM site_sessions WHERE id = ?`, loaded.sessionId);
    }
    const session = this.openSession(req, personId);
    return { cookie: session.cookie };
  }

  ensurePerson(req: Request): { person: Person; cookie: string | null } {
    const loaded = this.loadPerson(req);
    if (loaded.person) return { person: loaded.person, cookie: null };
    const created = this.createPerson(req);
    return {
      person: {
        id: created.personId,
        email: "",
        emailVerified: false,
        partnerUsername: "",
        kickUserId: "",
        name: "",
        avatarUrl: "",
        role: "player",
      },
      cookie: created.cookie,
    };
  }
}
