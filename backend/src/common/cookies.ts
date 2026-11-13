/**
 * Cookie parsing & building (same output as the Worker).
 */
import type { Request } from "express";
import { isSecureRequest } from "./http/request";

export const CSRF_COOKIE = "kdeenoff_csrf";

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function readCookie(header: string | undefined | null, name: string): string | null {
  if (!header) return null;
  const parts = header.split(";");
  for (const part of parts) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) {
      const decoded = safeDecode(v.join("="));
      if (decoded != null) return decoded;
    }
  }
  return null;
}

export function readAllCookies(header: string | undefined | null, name: string): string[] {
  if (!header) return [];
  const out: string[] = [];
  const parts = header.split(";");
  for (const part of parts) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) {
      const decoded = safeDecode(v.join("="));
      if (decoded != null) out.push(decoded);
    }
  }
  return out;
}

export interface CookieOptions {
  maxAge?: number | null;
  expires?: Date;
  path?: string;
  httpOnly?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  secure?: boolean;
}

export function buildCookie(name: string, value: string, req: Request | null, opts: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.expires) parts.push(`Expires=${opts.expires.toUTCString()}`);
  parts.push(`Path=${opts.path || "/"}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  parts.push(`SameSite=${opts.sameSite || "Lax"}`);

  const isSecure = Boolean(req && isSecureRequest(req));
  if (isSecure || opts.secure) parts.push("Secure");

  return parts.join("; ");
}

export function cookieHeader(req: Request): string | undefined {
  const raw = req.headers.cookie;
  return Array.isArray(raw) ? raw.join("; ") : raw;
}
