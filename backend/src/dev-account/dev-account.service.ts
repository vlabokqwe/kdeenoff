/**
 * Local preview only. Signs this browser into a fixed demo account, or out of it.
 * GET  /api/dev/account  { raffles } — how many local preview raffles are up.
 * POST /api/dev/account  { account: true|false, kick: true|false, raffleStep?: 1|-1 }
 * raffleStep adds one live raffle with the fixed preview settings, or removes the newest one this route added.
 * Any other host gets 404. The route does not exist for production traffic.
 */
import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { randomB64url } from "../common/crypto";
import { verifyCsrf } from "../common/csrf";
import { readBody } from "../common/http/read-body";
import { isLocalDevRequest } from "../common/http/request";
import {
  type HttpResult,
  forbidden,
  jsonResponse,
  methodNotAllowed,
  notFound,
  withCookies,
} from "../common/http/response";
import { asBool, asInt, asTrimmed } from "../common/validation";
import { AccessService } from "../access/access.service";
import { AppConfig } from "../config/app-config";
import { DatabaseService } from "../database/database.service";
import { buildLeaderboardAvatarUrl } from "../leaderboards/lb-avatar";
import { normalizeUserRole, SessionService, type UserRole } from "../session/session.service";

const DEMO_EMAIL = "local@kdeenoff.test";
const DEMO_KICK_ID = "local-demo";
const DEMO_NAME = "kdeenoff";
const DEMO_PARTNER_NAME = "kdeenoff_500";
/** Fixed settings for a raffle the local panel adds. Same shape as the admin form's example. */
const DEV_RAFFLE_TITLE = "Weekly $500 Raffle";
const DEV_RAFFLE_PRIZE = "$500";
const DEV_RAFFLE_NOTE = "One entry per Kick account.";
const DEV_RAFFLE_MS = 7 * 24 * 60 * 60 * 1000;

const DEMO_BOT_NAMES = [
  "lucky_seven",
  "slot_wizard",
  "highroller_x",
  "moon_spinner",
  "kick_hunter",
  "neon_ace",
  "turbo_bet",
  "wild_joker",
  "max_win_pls",
  "vault_raider",
  "crimson_dice",
  "ace_of_spades",
  "drift_king",
  "astro_punt",
  "shadow_stack",
  "gold_rush_99",
  "hyper_spin",
  "frost_bite",
  "blitz_spin",
  "omega_roll",
];

interface DevRaffleRow {
  id: number;
  title: string;
}

function previewAccount(
  account: boolean,
  kick: boolean,
  raffles = 0,
  roles: { role: UserRole; isAdmin: boolean; isStreamer: boolean } = {
    role: "player",
    isAdmin: false,
    isStreamer: false,
  },
  demoEntrants = 0,
  partnerUsername = "",
) {
  const avatarUrl = kick
    ? buildLeaderboardAvatarUrl(DEMO_NAME)
    : account
      ? buildLeaderboardAvatarUrl(DEMO_EMAIL.split("@")[0])
      : "";
  return {
    linked: kick,
    name: kick ? DEMO_NAME : "",
    avatarUrl,
    email: account ? DEMO_EMAIL : "",
    emailVerified: account,
    partnerUsername,
    role: roles.role,
    isAdmin: roles.isAdmin,
    isStreamer: roles.isStreamer,
    raffles,
    demoEntrants,
  };
}

@Injectable()
export class DevAccountService {
  constructor(
    private readonly config: AppConfig,
    private readonly access: AccessService,
    private readonly db: DatabaseService,
    private readonly session: SessionService,
  ) { }

  /** Live preview raffles this panel created. Edits in admin or expiry drop a row out of the set. */
  private devRaffles(now = Date.now()): DevRaffleRow[] {
    return this.db
      .all<DevRaffleRow>(
        `SELECT id, title FROM raffles
         WHERE prize = ? AND note = ? AND winner IS NULL AND hidden = 0
           AND starts_at <= ? AND ends_at > ?
           AND (title = ? OR title LIKE ?)
         ORDER BY id ASC`,
        DEV_RAFFLE_PRIZE,
        DEV_RAFFLE_NOTE,
        now,
        now,
        DEV_RAFFLE_TITLE,
        `${DEV_RAFFLE_TITLE} %`,
      )
      .map((row) => ({ id: Number(row.id), title: String(row.title || "") }))
      .filter((row) => this.isDevRaffleTitle(row.title));
  }

  private isDevRaffleTitle(title: string): boolean {
    if (title === DEV_RAFFLE_TITLE) return true;
    const match = /^Weekly \$500 Raffle (\d+)$/.exec(title);
    return !!match && Number(match[1]) >= 2;
  }

  private nextDevRaffleTitle(rows: DevRaffleRow[]): string {
    const titles = new Set(rows.map((row) => row.title));
    if (!titles.has(DEV_RAFFLE_TITLE)) return DEV_RAFFLE_TITLE;
    let n = 2;
    while (titles.has(`${DEV_RAFFLE_TITLE} ${n}`)) n += 1;
    return `${DEV_RAFFLE_TITLE} ${n}`;
  }

  /**
   * + inserts one live raffle (title, $500 prize, note, a 7-day window).
   * − deletes the newest of those, and its entries.
   */
  private stepRaffle(step: 1 | -1): number {
    const rows = this.devRaffles();
    if (step === -1) {
      const last = rows[rows.length - 1];
      if (!last) return 0;
      this.db.batch([
        this.db.stmt(`DELETE FROM raffle_winners WHERE raffle_id = ?`, last.id),
        this.db.stmt(`DELETE FROM raffle_entries WHERE raffle_id = ?`, last.id),
        this.db.stmt(`DELETE FROM raffles WHERE id = ?`, last.id),
      ]);
      return rows.length - 1;
    }

    const now = Date.now();
    this.db.run(
      `INSERT INTO raffles (
        title, prize, note, winner, starts_at, ends_at, hidden, is_demo, created_at, updated_at
      ) VALUES (?, ?, ?, NULL, ?, ?, 0, 1, ?, ?)`,
      this.nextDevRaffleTitle(rows),
      DEV_RAFFLE_PRIZE,
      DEV_RAFFLE_NOTE,
      now,
      now + DEV_RAFFLE_MS,
      now,
      now,
    );
    return rows.length + 1;
  }

  private currentDemoRole(): UserRole {
    const row = this.db.first<{ role: string }>(
      `SELECT role FROM site_people WHERE email = ? OR kick_user_id = ? ORDER BY updated_at DESC LIMIT 1`,
      DEMO_EMAIL,
      DEMO_KICK_ID,
    );
    return row ? normalizeUserRole(row.role) : "admin";
  }

  private resolveTargetRaffleId(explicitId: number | null): number | null {
    if (explicitId && explicitId > 0) {
      const hit = this.db.first<{ id: number }>(`SELECT id FROM raffles WHERE id = ?`, explicitId);
      if (hit) return Number(hit.id);
    }
    const open = this.db.first<{ id: number }>(
      `SELECT id FROM raffles WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1`,
    );
    if (open) return Number(open.id);
    const anyRow = this.db.first<{ id: number }>(`SELECT id FROM raffles ORDER BY id DESC LIMIT 1`);
    return anyRow ? Number(anyRow.id) : null;
  }

  private countDemoEntrants(targetRaffleId: number | null = null): number {
    const rid = this.resolveTargetRaffleId(targetRaffleId);
    if (!rid) return 0;
    const row = this.db.first<{ c: number }>(
      `SELECT COUNT(*) AS c FROM raffle_entries WHERE raffle_id = ? AND kick_user_id LIKE 'demo-bot-%'`,
      rid,
    );
    return Number(row?.c) || 0;
  }

  private stepDemoEntrants(step: number, explicitRaffleId: number | null = null): number {
    const rid = this.resolveTargetRaffleId(explicitRaffleId);
    if (!rid) return 0;

    if (step < 0) {
      const removeCount = Math.min(25, Math.abs(step));
      this.db.run(
        `DELETE FROM raffle_entries
         WHERE id IN (
           SELECT id FROM raffle_entries
           WHERE raffle_id = ? AND kick_user_id LIKE 'demo-bot-%'
           ORDER BY id DESC
           LIMIT ?
         )`,
        rid,
        removeCount,
      );
      this.db.run(
        `DELETE FROM kick_accounts
         WHERE kick_user_id LIKE 'demo-bot-%'
           AND NOT EXISTS (SELECT 1 FROM raffle_entries re WHERE re.kick_user_id = kick_accounts.kick_user_id)`,
      );
      return this.countDemoEntrants(rid);
    }

    const addCount = Math.min(25, step);
    const existing = new Set(
      this.db
        .all<{ kick_user_id: string }>(
          `SELECT kick_user_id FROM raffle_entries WHERE raffle_id = ? AND kick_user_id LIKE 'demo-bot-%'`,
          rid,
        )
        .map((r) => String(r.kick_user_id)),
    );

    const now = Date.now();
    const bannedBots = new Set(
      this.db
        .all<{ kick_user_id: string }>(
          `SELECT kick_user_id FROM raffle_bans
           WHERE kick_user_id LIKE 'demo-bot-%'
             AND (is_permanent = 1 OR (banned_until IS NOT NULL AND banned_until > ?))`,
          now,
        )
        .map((r) => String(r.kick_user_id)),
    );
    const tx = this.db.db.transaction(() => {
      let added = 0;
      let n = 1;
      while (added < addCount && n <= 500) {
        const botId = `demo-bot-${n}`;
        if (!existing.has(botId) && !bannedBots.has(botId)) {
          const botName =
            n <= DEMO_BOT_NAMES.length ? DEMO_BOT_NAMES[n - 1] : `viewer_${n}`;
          const botPartner = `${botName}_500`;
          this.db.run(
            `INSERT INTO kick_accounts (kick_user_id, name, avatar_url, partner_username, linked_at, updated_at)
             VALUES (?, ?, '', ?, ?, ?)
             ON CONFLICT(kick_user_id) DO UPDATE SET
               name = excluded.name,
               partner_username = COALESCE(NULLIF(TRIM(kick_accounts.partner_username), ''), excluded.partner_username),
               updated_at = excluded.updated_at`,
            botId,
            botName,
            botPartner,
            now,
            now,
          );
          this.db.run(
            `INSERT OR IGNORE INTO raffle_entries (raffle_id, kick_user_id, created_at)
             VALUES (?, ?, ?)`,
            rid,
            botId,
            now + added,
          );
          existing.add(botId);
          added += 1;
        }
        n += 1;
      }
    });
    tx();
    return this.countDemoEntrants(rid);
  }

  private ensureDemoPerson(
    account: boolean,
    kick: boolean,
    requestedRole?: UserRole | null,
  ): string {
    const now = Date.now();
    this.db.run(
      `INSERT INTO kick_accounts (kick_user_id, name, avatar_url, partner_username, linked_at, updated_at)
       VALUES (?, ?, '', ?, ?, ?)
       ON CONFLICT(kick_user_id) DO UPDATE SET
         name = excluded.name,
         partner_username = COALESCE(NULLIF(TRIM(kick_accounts.partner_username), ''), excluded.partner_username),
         updated_at = excluded.updated_at`,
      DEMO_KICK_ID,
      DEMO_NAME,
      DEMO_PARTNER_NAME,
      now,
      now,
    );

    const byEmail = this.db.first<{ id: string; role: string; partner_username: string | null }>(
      `SELECT id, role, partner_username FROM site_people WHERE email = ?`,
      DEMO_EMAIL,
    );
    const byKick = this.db.first<{ id: string; role: string; partner_username: string | null }>(
      `SELECT id, role, partner_username FROM site_people WHERE kick_user_id = ?`,
      DEMO_KICK_ID,
    );

    if (byKick && byEmail && byKick.id !== byEmail.id) {
      this.db.run(
        `UPDATE site_people SET kick_user_id = NULL, updated_at = ? WHERE id = ?`,
        now,
        byKick.id,
      );
    }

    const personId = (byEmail && byEmail.id) || (byKick && byKick.id) || randomB64url(16);
    const existingRole = byEmail
      ? normalizeUserRole(byEmail.role)
      : byKick
        ? normalizeUserRole(byKick.role)
        : "admin";
    const existingPartner = String(
      byEmail?.partner_username || byKick?.partner_username || "",
    ).trim();
    const partnerUsername = existingPartner || (account ? DEMO_PARTNER_NAME : null);
    const role: UserRole = requestedRole || existingRole;
    const email = account ? DEMO_EMAIL : null;
    const verifiedAt = account ? now : null;
    const kickId = kick ? DEMO_KICK_ID : null;
    if (byEmail || byKick) {
      this.db.run(
        `UPDATE site_people
         SET email = ?, email_verified_at = ?, partner_username = ?, kick_user_id = ?, role = ?, updated_at = ?
         WHERE id = ?`,
        email,
        verifiedAt,
        partnerUsername,
        kickId,
        role,
        now,
        personId,
      );
      return personId;
    }

    this.db.run(
      `INSERT INTO site_people (id, email, email_verified_at, partner_username, kick_user_id, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      personId,
      email,
      verifiedAt,
      partnerUsername,
      kickId,
      role,
      now,
      now,
    );
    return personId;
  }

  async handleDevAccount(req: Request): Promise<HttpResult> {
    if (!isLocalDevRequest(req, this.config.isProduction)) return notFound();
    const method = req.method.toUpperCase();
    if (method === "GET" || method === "HEAD") {
      const { person } = this.session.loadPerson(req);
      const role = person ? person.role : this.currentDemoRole();
      return jsonResponse({
        raffles: this.devRaffles().length,
        role,
        demoEntrants: this.countDemoEntrants(),
      });
    }
    if (method !== "POST") return methodNotAllowed(req.method);
    const csrf = verifyCsrf(req);
    if (!csrf.ok) return forbidden(csrf.error);

    const body = await readBody(req);

    const explicitRaffleId =
      body && body.raffleId !== undefined && body.raffleId !== null ? asInt(body.raffleId) : null;
    const demoEntrantsStep =
      body && body.demoEntrantsStep !== undefined ? asInt(body.demoEntrantsStep) : null;
    if (
      body &&
      body.demoEntrantsStep !== undefined &&
      (demoEntrantsStep == null || demoEntrantsStep === 0 || Math.abs(demoEntrantsStep) > 25)
    ) {
      return jsonResponse({ error: "entrants" }, 400);
    }

    let requestedRole: UserRole | null = null;
    if (body && body.role !== undefined) {
      const rawRole = asTrimmed(body.role).toLowerCase();
      if (rawRole !== "player" && rawRole !== "streamer" && rawRole !== "admin") {
        return jsonResponse({ error: "role" }, 400);
      }
      requestedRole = rawRole;
    }

    const account = asBool(body && body.account);
    const kick = asBool(body && body.kick);
    if (account == null || kick == null) {
      if (demoEntrantsStep != null) {
        const demoEntrants = this.stepDemoEntrants(demoEntrantsStep, explicitRaffleId);
        return jsonResponse({
          ok: true,
          raffles: this.devRaffles().length,
          demoEntrants,
        });
      }
      return jsonResponse({ error: "account" }, 400);
    }

    const raffleStep = body && body.raffleStep !== undefined ? asInt(body.raffleStep) : null;
    if (body && body.raffleStep !== undefined && raffleStep !== 1 && raffleStep !== -1) {
      return jsonResponse({ error: "raffle" }, 400);
    }

    const raffleCount =
      raffleStep === 1 || raffleStep === -1 ? this.stepRaffle(raffleStep) : this.devRaffles().length;
    const demoEntrants =
      demoEntrantsStep != null
        ? this.stepDemoEntrants(demoEntrantsStep, explicitRaffleId)
        : this.countDemoEntrants(explicitRaffleId);

    if (!account && !kick) {
      const now = Date.now();
      if (requestedRole) {
        this.db.run(
          `UPDATE site_people
           SET email = NULL, email_verified_at = NULL, kick_user_id = NULL, role = ?, updated_at = ?
           WHERE email = ? OR kick_user_id = ?`,
          requestedRole,
          now,
          DEMO_EMAIL,
          DEMO_KICK_ID,
        );
      } else {
        this.db.run(
          `UPDATE site_people
           SET email = NULL, email_verified_at = NULL, kick_user_id = NULL, updated_at = ?
           WHERE email = ? OR kick_user_id = ?`,
          now,
          DEMO_EMAIL,
          DEMO_KICK_ID,
        );
      }
      const dropped = this.session.dropSession(req);
      return withCookies(
        jsonResponse(
          previewAccount(
            false,
            false,
            raffleCount,
            { role: "player", isAdmin: false, isStreamer: false },
            demoEntrants,
          ),
        ),
        dropped.clear ? [dropped.cookie] : [],
      );
    }

    const personId = this.ensureDemoPerson(account, kick, requestedRole);
    const adopted = this.session.adoptPerson(req, personId);
    const personRow = this.db.first<{ role: string; partner_username: string | null }>(
      `SELECT p.role,
              COALESCE(NULLIF(TRIM(p.partner_username), ''), NULLIF(TRIM(a.partner_username), ''), '') AS partner_username
       FROM site_people p
       LEFT JOIN kick_accounts a ON a.kick_user_id = p.kick_user_id
       WHERE p.id = ?`,
      personId,
    );
    const activeRole: UserRole = requestedRole || normalizeUserRole(personRow?.role);
    const roles = {
      role: activeRole,
      isAdmin: activeRole === "admin",
      isStreamer: activeRole === "streamer" || activeRole === "admin",
    };
    return withCookies(
      jsonResponse(
        previewAccount(
          account,
          kick,
          raffleCount,
          roles,
          demoEntrants,
          String(personRow?.partner_username || ""),
        ),
      ),
      adopted.cookie ? [adopted.cookie] : [],
    );
  }
}
