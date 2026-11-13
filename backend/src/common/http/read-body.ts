/**
 * Request body reading with the Worker's semantics (lib/validation.js readBody):
 *   - declared Content-Length > 512 KB -> null
 *   - application/json -> parsed value, or null on empty / invalid JSON
 *   - urlencoded / multipart -> plain object of fields
 *   - anything else -> null
 * Supports both Express incoming streams (NestJS) and WHATWG `Request` (Cloudflare Worker).
 */
import type { Request as ExpressRequest } from "express";

const READ_BODY_MAX_BYTES = 512 * 1024; // 512 KB
const BODY_CACHE = Symbol("kdeenoff.body");
export const FETCH_REQUEST = Symbol.for("kdeenoff.fetchRequest");

type BodyCarrier = ExpressRequest & {
  [BODY_CACHE]?: Promise<unknown>;
  [FETCH_REQUEST]?: Request;
};

async function readFetchRaw(fetchReq: Request, limit: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!fetchReq.body) return new Uint8Array(0);
  const reader = fetchReq.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function readExpressRaw(req: ExpressRequest, limit: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (req.readableEnded) return Promise.resolve(new Uint8Array(0));
  return new Promise((resolve) => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    let over = false;
    let settled = false;
    const finish = (value: Uint8Array<ArrayBuffer> | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const merge = (): Uint8Array<ArrayBuffer> => {
      const out = new Uint8Array(size);
      let offset = 0;
      for (const c of chunks) {
        out.set(c, offset);
        offset += c.byteLength;
      }
      return out;
    };
    req.on("data", (chunk: Uint8Array) => {
      if (over) return;
      size += chunk.byteLength;
      if (size > limit) {
        over = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => finish(over ? null : merge()));
    req.on("error", () => finish(null));
    req.on("close", () => finish(over ? null : merge()));
  });
}

function readRaw(req: ExpressRequest, limit: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const fetchReq = (req as BodyCarrier)[FETCH_REQUEST];
  if (fetchReq) return readFetchRaw(fetchReq, limit);
  return readExpressRaw(req, limit);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function parseBody(req: ExpressRequest): Promise<any> {
  const ct = req.get("content-type") || "";
  const declared = Number(req.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > READ_BODY_MAX_BYTES) return null;

  if (ct.includes("application/json")) {
    try {
      const raw = await readRaw(req, READ_BODY_MAX_BYTES);
      if (!raw) return null;
      const text = new TextDecoder().decode(raw);
      if (!text || text.length === 0) return null;
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    try {
      const raw = await readRaw(req, READ_BODY_MAX_BYTES);
      if (!raw) return null;
      const fd = await new Request("http://localhost/", {
        method: "POST",
        headers: { "content-type": ct },
        body: raw,
      }).formData();
      const out: Record<string, unknown> = {};
      for (const [k, v] of fd.entries()) out[k] = v;
      return out;
    } catch {
      return null;
    }
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readBody(req: ExpressRequest): Promise<any> {
  const carrier = req as BodyCarrier;
  if (!carrier[BODY_CACHE]) carrier[BODY_CACHE] = parseBody(req);
  return carrier[BODY_CACHE]!;
}
