/**
 * Public raffle list and admin CRUD.
 * A raffle is ongoing while ends_at is still ahead, and past after that.
 */
import { asBool, asTrimmed, readBody } from "../lib/validation.js";
import { badRequest, jsonResponse, notFound, serverError } from "../lib/response.js";
import { audit } from "../lib/audit.js";

const TITLE_MAX = 120;
const PRIZE_MAX = 120;
const NOTE_MAX = 500;
const WINNER_MAX = 80;

export async function handlePublicRaffles(env) {
  if (!env.DB) return serverError("Database not configured");

  const now = Date.now();
  const rs = await env.DB.prepare(
    `SELECT id, title, prize, note, winner, starts_at, ends_at
     FROM raffles
     WHERE hidden = 0
     ORDER BY ends_at DESC, id DESC`,
  ).all();

  const rows = rs.results || [];
  const ongoing = rows
    .filter((row) => Number(row.ends_at) >= now)
    .sort((a, b) => Number(a.ends_at) - Number(b.ends_at) || a.id - b.id);
  const past = rows.filter((row) => Number(row.ends_at) < now);

  return jsonResponse({ ongoing, past });
}

export async function handleAdminRaffles(request, env, segs, method, actor) {
  if (!env.DB) return serverError("Database not configured");

  if (segs.length === 0 && method === "GET") {
    const rs = await env.DB.prepare(
      `SELECT * FROM raffles ORDER BY ends_at DESC, id DESC`,
    ).all();
    return jsonResponse({ raffles: rs.results || [] });
  }

  if (segs.length === 0 && method === "POST") {
    const body = await readBody(request);
    if (!body) return badRequest("Invalid data");
    const fields = fieldsFrom(body, null);
    if (fields.error) return badRequest(fields.error);

    const now = Date.now();
    try {
      const res = await env.DB.prepare(
        `INSERT INTO raffles (
          title, prize, note, winner, starts_at, ends_at, hidden, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          fields.title,
          fields.prize,
          fields.note,
          fields.winner,
          fields.startsAt,
          fields.endsAt,
          fields.hidden,
          now,
          now,
        )
        .run();

      const id = res.meta.last_row_id;
      audit(env, actor, "raffle.create", String(id), { title: fields.title });
      return jsonResponse({ ok: true, id });
    } catch (e) {
      return badRequest(`Failed to create raffle: ${e.message}`);
    }
  }

  const id = raffleId(segs[0]);
  if (!id || segs.length !== 1) return notFound();

  const current = await env.DB.prepare(`SELECT * FROM raffles WHERE id = ?`).bind(id).first();
  if (!current) return notFound("Raffle not found");

  if (method === "PATCH") {
    const body = await readBody(request);
    if (!body) return badRequest("Invalid data");
    const fields = fieldsFrom(body, current);
    if (fields.error) return badRequest(fields.error);

    const now = Date.now();
    await env.DB.prepare(
      `UPDATE raffles SET
        title = ?, prize = ?, note = ?, winner = ?, starts_at = ?, ends_at = ?, hidden = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(
        fields.title,
        fields.prize,
        fields.note,
        fields.winner,
        fields.startsAt,
        fields.endsAt,
        fields.hidden,
        now,
        id,
      )
      .run();

    audit(env, actor, "raffle.update", String(id), { title: fields.title });
    return jsonResponse({ ok: true, id });
  }

  if (method === "DELETE") {
    await env.DB.prepare(`DELETE FROM raffles WHERE id = ?`).bind(id).run();
    audit(env, actor, "raffle.delete", String(id), { title: current.title });
    return jsonResponse({ ok: true });
  }

  return notFound();
}

function raffleId(seg) {
  if (!/^\d+$/.test(String(seg || ""))) return null;
  const n = Number(seg);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

function clip(value, max) {
  const text = asTrimmed(value);
  return text.length > max ? text.slice(0, max) : text;
}

function optionalText(value, max) {
  const text = clip(value, max);
  return text || null;
}

function asTime(value, fallback) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function fieldsFrom(body, current) {
  const title = clip(body.title !== undefined ? body.title : current?.title, TITLE_MAX);
  if (!title) return { error: "Title is required" };

  const prize = clip(body.prize !== undefined ? body.prize : current?.prize, PRIZE_MAX);
  const note = body.note !== undefined ? optionalText(body.note, NOTE_MAX) : current?.note || null;
  const winner = body.winner !== undefined ? optionalText(body.winner, WINNER_MAX) : current?.winner || null;

  const startsAt = asTime(body.starts_at, current ? Number(current.starts_at) : Date.now());
  const endsAt = asTime(body.ends_at, current ? Number(current.ends_at) : null);
  if (startsAt == null) return { error: "Invalid start date" };
  if (endsAt == null) return { error: "End date is required" };
  if (endsAt < startsAt) return { error: "End date is before start date" };

  let hidden = current ? (current.hidden ? 1 : 0) : 0;
  if (body.hidden !== undefined) {
    const flag = asBool(body.hidden);
    if (flag == null) return { error: "Invalid hidden flag" };
    hidden = flag ? 1 : 0;
  }

  return { title, prize, note, winner, startsAt, endsAt, hidden };
}
