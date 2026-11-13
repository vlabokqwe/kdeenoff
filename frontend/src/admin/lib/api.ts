/**
 * Admin API client — same request/error semantics as the legacy admin.js:
 * - always `accept: application/json`, same-origin credentials;
 * - for non-GET/HEAD requests the CSRF token from the `kdeenoff_csrf` cookie
 *   goes into the `x-csrf` header (double-submit cookie, checked by the server);
 * - string bodies are sent as JSON unless a content-type was given;
 * - a non-2xx response throws an `ApiError` with the server `error` text
 *   (or `HTTP <status>` when the body is not JSON).
 */

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getCsrfToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)kdeenoff_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

export async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const method = (opts.method || "GET").toUpperCase();
  const headers = new Headers(opts.headers || {});
  headers.set("accept", "application/json");

  if (method !== "GET" && method !== "HEAD") {
    const csrf = getCsrfToken();
    if (csrf) headers.set("x-csrf", csrf);
    if (!headers.has("content-type") && opts.body && typeof opts.body === "string") {
      headers.set("content-type", "application/json");
    }
  }

  const res = await fetch(path, { ...opts, headers, credentials: "same-origin" });
  if (!res.ok) {
    let errData: { error?: string };
    try {
      errData = (await res.json()) as { error?: string };
    } catch {
      errData = { error: `HTTP ${res.status}` };
    }
    throw new ApiError(errData?.error || `HTTP ${res.status}`, res.status);
  }
  const data = (await res.json()) as T;

  if (method !== "GET" && method !== "HEAD") {
    try {
      const rev = String(Date.now());
      localStorage.setItem("kdeenoff-data-rev", rev);
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("kdeenoff-admin");
        bc.postMessage({ type: "data-changed", rev });
        bc.close();
      }
    } catch {
      // Ignore storage / BroadcastChannel restrictions
    }
  }

  return data;
}

/** Message of a caught error (what admin.js showed as `err.message`). */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
