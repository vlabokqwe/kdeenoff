/**
 * Email confirmation codes, sent through Resend.
 * POST /api/account/email          send a code
 * POST /api/account/email/confirm  check the code
 * POST /api/account/logout         forget this browser
 */
import { Injectable, Logger } from "@nestjs/common";
import type { Request } from "express";
import { codeEmailHtml, codeEmailText } from "../common/code-email";
import { randomB64url, sha256Hex, timingSafeEqualStr } from "../common/crypto";
import { verifyCsrf, verifySameOrigin } from "../common/csrf";
import { readBody } from "../common/http/read-body";
import {
  type HttpResult,
  forbidden,
  jsonResponse,
  methodNotAllowed,
  withCookies,
} from "../common/http/response";
import { isValidEmail, normalizeEmail } from "../common/validation";
import { AccessService } from "../access/access.service";
import { AppConfig } from "../config/app-config";
import { DatabaseService } from "../database/database.service";
import { buildLeaderboardAvatarUrl } from "../leaderboards/lb-avatar";
import { SessionService } from "../session/session.service";

const CODE_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const HOUR_CAP = 5;
const MAX_ATTEMPTS = 5;
const FROM = "KDeenOff <noreply@kdeenoff.bet>";

function fail(code: string, status: number, cookie?: string | null): HttpResult {
  return withCookies(jsonResponse({ error: code }, status), cookie ? [cookie] : []);
}

function sixDigit(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, "0");
}

function codeHash(salt: string, code: string): string {
  return sha256Hex(`${salt}:${code}`);
}

@Injectable()
export class AccountService {
  private readonly logger = new Logger("Account");

  constructor(
    private readonly config: AppConfig,
    private readonly access: AccessService,
    private readonly db: DatabaseService,
    private readonly session: SessionService,
  ) { }

  private resendReady(): boolean {
    const key = String(this.config.RESEND_API_KEY || "").trim();
    return Boolean(key && key.length < 200 && !/[\r\n]/.test(key));
  }

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

  async handleAccountEmail(req: Request): Promise<HttpResult> {
    if (req.method.toUpperCase() !== "POST") return methodNotAllowed(req.method);
    const csrf = verifyCsrf(req);
    if (!csrf.ok) return forbidden(csrf.error);

    const body = await readBody(req);
    const email = normalizeEmail(body && body.email);
    if (!isValidEmail(email)) return fail("email", 400);
    if (!this.resendReady()) return fail("config", 503);

    const existing = await this.session.loadPerson(req);
    let ensured: { person: NonNullable<typeof existing.person>; cookie: string | null };
    try {
      ensured = existing.person
        ? { person: existing.person, cookie: null }
        : await this.session.ensurePerson(req);
    } catch (err) {
      this.logger.error(`email session failed: ${(err as Error)?.message || err}`);
      return fail("store", 500);
    }
    const person = ensured.person;
    const cookie = ensured.cookie;

    const now = Date.now();
    const latest = await this.db.first<{ created_at: number }>(
      `SELECT created_at FROM email_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1`,
      email,
    );
    if (latest && now - Number(latest.created_at) < COOLDOWN_MS) {
      return fail("wait", 429, cookie);
    }

    const hour = await this.db.first<{ n: number }>(
      `SELECT COUNT(*) AS n FROM email_codes WHERE email = ? AND created_at > ?`,
      email,
      now - HOUR_MS,
    );
    if (Number(hour?.n) >= HOUR_CAP) return fail("limit", 429, cookie);

    const code = sixDigit();
    const salt = randomB64url(16);
    const hash = codeHash(salt, code);
    await this.db.run(`DELETE FROM email_codes WHERE created_at < ?`, now - 24 * HOUR_MS);
    await this.db.run(
      `INSERT INTO email_codes (person_id, email, code_hash, salt, expires_at, attempts, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      person.id,
      email,
      hash,
      salt,
      now + CODE_MS,
      now,
    );

    try {
      const sent = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${String(this.config.RESEND_API_KEY).trim()}`,
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
        const detail = await sent.text();
        this.logger.error(`resend send failed: ${sent.status} ${detail.slice(0, 500)}`);
        await this.db.run(
          `DELETE FROM email_codes WHERE person_id = ? AND created_at = ?`,
          person.id,
          now,
        );
        return fail("send", 502, cookie);
      }
    } catch (err) {
      this.logger.error(`resend send error: ${(err as Error)?.message || err}`);
      await this.db.run(
        `DELETE FROM email_codes WHERE person_id = ? AND created_at = ?`,
        person.id,
        now,
      );
      return fail("send", 502, cookie);
    }

    return withCookies(jsonResponse({ ok: true }), cookie ? [cookie] : []);
  }

  async handleAccountEmailConfirm(req: Request): Promise<HttpResult> {
    if (req.method.toUpperCase() !== "POST") return methodNotAllowed(req.method);
    const csrf = verifyCsrf(req);
    if (!csrf.ok) return forbidden(csrf.error);

    const body = await readBody(req);
    const code = String((body && body.code) || "").trim();
    if (!/^\d{6}$/.test(code)) return fail("bad", 400);

    const loaded = await this.session.loadPerson(req);
    if (!loaded.person || !loaded.sessionId) return fail("expired", 400);

    const row = await this.db.first<{
      id: number;
      email: string;
      code_hash: string;
      salt: string;
      expires_at: number;
      attempts: number;
    }>(
      `SELECT id, email, code_hash, salt, expires_at, attempts
       FROM email_codes WHERE person_id = ? ORDER BY created_at DESC LIMIT 1`,
      loaded.person.id,
    );
    if (!row) return fail("expired", 400);
    if (Number(row.expires_at) < Date.now() || Number(row.attempts) >= MAX_ATTEMPTS) {
      await this.db.run(`DELETE FROM email_codes WHERE id = ?`, row.id);
      return fail("expired", 400);
    }

    const hash = codeHash(String(row.salt), code);
    if (!timingSafeEqualStr(hash, String(row.code_hash))) {
      await this.db.run(`UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?`, row.id);
      return fail("bad", 400);
    }

    const targetEmail = normalizeEmail(row.email);
    const current = loaded.person;
    const now = Date.now();

    try {
      const owner = await this.db.first<{
        id: string;
        kick_user_id: string | null;
        partner_username: string | null;
      }>(
        `SELECT id, kick_user_id, partner_username FROM site_people WHERE lower(email) = ?`,
        targetEmail,
      );

      if (owner && owner.id !== current.id) {
        // Sign this browser session into the existing account (merging unverified guest Kick/partner if free).
        const stmts = [];
        const moveKick = Boolean(!current.emailVerified && current.kickUserId && !owner.kick_user_id);
        const canDropCurrent = Boolean(!current.emailVerified && (!current.kickUserId || moveKick));

        if (moveKick) {
          stmts.push(
            this.db.stmt(`UPDATE site_people SET kick_user_id = NULL WHERE id = ?`, current.id),
            this.db.stmt(
              `UPDATE site_people SET kick_user_id = ?, updated_at = ? WHERE id = ?`,
              current.kickUserId,
              now,
              owner.id,
            ),
          );
        }

        if (
          !current.emailVerified &&
          current.partnerUsername &&
          !String(owner.partner_username || "").trim()
        ) {
          stmts.push(
            this.db.stmt(
              `UPDATE site_people SET partner_username = ?, updated_at = ? WHERE id = ?`,
              current.partnerUsername,
              now,
              owner.id,
            ),
          );
          const targetKick = owner.kick_user_id || (moveKick ? current.kickUserId : "");
          if (targetKick) {
            stmts.push(
              this.db.stmt(
                `UPDATE kick_accounts
                 SET partner_username = COALESCE(NULLIF(TRIM(partner_username), ''), ?), updated_at = ?
                 WHERE kick_user_id = ?`,
                current.partnerUsername,
                now,
                targetKick,
              ),
            );
          }
        }

        stmts.push(
          this.db.stmt(
            `UPDATE site_people
             SET email = ?, email_verified_at = COALESCE(email_verified_at, ?), updated_at = ?
             WHERE id = ?`,
            targetEmail,
            now,
            now,
            owner.id,
          ),
          this.db.stmt(
            `UPDATE site_sessions SET person_id = ? WHERE id = ?`,
            owner.id,
            loaded.sessionId,
          ),
          this.db.stmt(`DELETE FROM email_codes WHERE person_id IN (?, ?)`, current.id, owner.id),
        );

        if (canDropCurrent) {
          stmts.push(
            this.db.stmt(
              `UPDATE site_sessions SET person_id = ? WHERE person_id = ?`,
              owner.id,
              current.id,
            ),
            this.db.stmt(`DELETE FROM site_people WHERE id = ?`, current.id),
          );
        }

        await this.db.batch(stmts);
      } else if (!owner && current.emailVerified && normalizeEmail(current.email) !== targetEmail) {
        // Already signed into a different verified account: create a fresh account for the new email.
        const newPersonId = randomB64url(16);
        await this.db.batch([
          this.db.stmt(
            `INSERT INTO site_people (id, email, email_verified_at, kick_user_id, created_at, updated_at)
             VALUES (?, ?, ?, NULL, ?, ?)`,
            newPersonId,
            targetEmail,
            now,
            now,
            now,
          ),
          this.db.stmt(
            `UPDATE site_sessions SET person_id = ? WHERE id = ?`,
            newPersonId,
            loaded.sessionId,
          ),
          this.db.stmt(`DELETE FROM email_codes WHERE person_id = ?`, current.id),
        ]);
      } else {
        // Confirm email onto the current person record.
        await this.db.batch([
          this.db.stmt(
            `UPDATE site_people
             SET email = ?, email_verified_at = COALESCE(email_verified_at, ?), updated_at = ?
             WHERE id = ?`,
            targetEmail,
            now,
            now,
            current.id,
          ),
          this.db.stmt(`DELETE FROM email_codes WHERE person_id = ?`, current.id),
        ]);
      }
    } catch (err) {
      this.logger.error(`email confirm failed: ${(err as Error)?.message || err}`);
      return fail("store", 500);
    }

    const resolved = await this.session.loadPerson(req);
    const person = resolved.person;
    const roles = await this.access.resolveAccountRoles(req);
    const raffleBan = person?.kickUserId ? await this.loadActiveBan(person.kickUserId) : null;
    const linked = Boolean(person && person.kickUserId && person.name);
    const resolvedEmail = person?.email || targetEmail;
    const avatarUrl =
      linked && person
        ? buildLeaderboardAvatarUrl(person.name)
        : buildLeaderboardAvatarUrl(resolvedEmail.split("@")[0] || person?.id || current.id);

    return jsonResponse({
      ok: true,
      linked,
      name: person?.name || "",
      avatarUrl,
      email: resolvedEmail,
      emailVerified: true,
      partnerUsername: person?.partnerUsername || "",
      raffleBan,
      role: roles.role,
      isAdmin: roles.isAdmin,
      isStreamer: roles.isStreamer,
    });
  }

  async handleAccountPartner(req: Request): Promise<HttpResult> {
    if (req.method.toUpperCase() !== "POST") return methodNotAllowed(req.method);
    const csrf = verifyCsrf(req);
    if (!csrf.ok) return forbidden(csrf.error);
    if (!verifySameOrigin(req)) return forbidden("origin");

    const body = await readBody(req);
    const raw = typeof body?.partnerUsername === "string" ? body.partnerUsername : "";
    const partnerUsername = raw.trim().replace(/\s+/g, " ");
    if (
      partnerUsername.length < 2 ||
      partnerUsername.length > 48 ||
      /[\u0000-\u001f\u007f<>"'`\\]/.test(partnerUsername)
    ) {
      return fail("partner", 400);
    }

    const existing = await this.session.loadPerson(req);
    let ensured: { person: NonNullable<typeof existing.person>; cookie: string | null };
    try {
      ensured = existing.person
        ? { person: existing.person, cookie: null }
        : await this.session.ensurePerson(req);
    } catch (err) {
      this.logger.error(`partner session failed: ${(err as Error)?.message || err}`);
      return fail("store", 500);
    }

    const { person, cookie } = ensured;
    const now = Date.now();
    try {
      const stmts = [
        this.db.stmt(
          `UPDATE site_people SET partner_username = ?, updated_at = ? WHERE id = ?`,
          partnerUsername,
          now,
          person.id,
        ),
      ];
      if (person.kickUserId) {
        stmts.push(
          this.db.stmt(
            `UPDATE kick_accounts SET partner_username = ?, updated_at = ? WHERE kick_user_id = ?`,
            partnerUsername,
            now,
            person.kickUserId,
          ),
        );
      }
      await this.db.batch(stmts);
    } catch (err) {
      this.logger.error(`partner username save failed: ${(err as Error)?.message || err}`);
      return fail("store", 500, cookie);
    }

    return withCookies(
      jsonResponse({
        ok: true,
        partnerUsername,
      }),
      cookie ? [cookie] : [],
    );
  }

  async handleAccountLogout(req: Request): Promise<HttpResult> {
    if (req.method.toUpperCase() !== "POST") return methodNotAllowed(req.method);
    const csrf = verifyCsrf(req);
    if (!csrf.ok) return forbidden(csrf.error);
    const dropped = await this.session.dropSession(req);
    return withCookies(jsonResponse({ ok: true }), dropped.clear ? [dropped.cookie] : []);
  }
}
