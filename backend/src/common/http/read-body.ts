/**
 * Request body reading with the Worker's semantics (lib/validation.js readBody):
 *   - declared Content-Length > 512 KB -> null
 *   - application/json -> parsed value, or null on empty / invalid JSON
 *   - urlencoded / multipart -> plain object of fields
 *   - anything else -> null
 * Nest's body parser is disabled, so the raw stream is read here (once per request).
 */
import type { Request as ExpressRequest } from "express";

const READ_BODY_MAX_BYTES = 512 * 1024; // 512 KB
const BODY_CACHE = Symbol("kdeenoff.body");

type BodyCarrier = ExpressRequest & { [BODY_CACHE]?: Promise<unknown> };

function readRaw(req: ExpressRequest, limit: number): Promise<Buffer | null> {
  if (req.readableEnded) return Promise.resolve(Buffer.alloc(0));
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    let settled = false;
    const finish = (value: Buffer | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    req.on("data", (chunk: Buffer) => {
      if (over) return;
      size += chunk.length;
      if (size > limit) {
        over = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => finish(over ? null : Buffer.concat(chunks)));
    req.on("error", () => finish(null));
    req.on("close", () => finish(over ? null : Buffer.concat(chunks)));
  });
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
