/**
 * Fetch helpers for the site API. Same headers and error handling as the old vanilla scripts:
 * JSON in and out, the CSRF cookie echoed in `x-csrf`, and `{ error }` codes surfaced as Error messages.
 */

/** The double-submit CSRF token the server sets in the `kdeenoff_csrf` cookie. */
export function readCsrf(): string {
  const match = document.cookie.match(/(?:^|;\s*)kdeenoff_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

/** Error carrying the server's `error` code as its message and the parsed JSON body. */
export class ApiError extends Error {
  readonly body: Record<string, unknown>;
  readonly status: number;

  constructor(code: string, body: Record<string, unknown> = {}, status = 0) {
    super(code);
    this.name = "ApiError";
    this.body = body;
    this.status = status;
  }
}

export interface GetOptions {
  /** Defaults to `same-origin`. */
  credentials?: RequestCredentials;
  cache?: RequestCache;
  signal?: AbortSignal;
}

/** GET a JSON document. Throws `Error("HTTP <status>")` on a non-2xx answer. */
export async function getJson<T>(url: string, options: GetOptions = {}): Promise<T> {
  const res = await fetch(url, {
    credentials: options.credentials ?? "same-origin",
    cache: options.cache,
    signal: options.signal,
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new ApiError(`HTTP ${res.status}`, {}, res.status);
  return (await res.json()) as T;
}

async function readBody(res: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await res.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * POST a JSON payload with the CSRF header.
 * On a non-2xx answer throws `ApiError(body.error || "store")` so callers can map error codes to copy.
 */
export async function postJson<T = Record<string, unknown>>(url: string, payload?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-csrf": readCsrf(),
    },
    body: JSON.stringify(payload ?? {}),
  });
  const body = await readBody(res);
  if (!res.ok) {
    const code = typeof body.error === "string" && body.error ? body.error : "store";
    throw new ApiError(code, body, res.status);
  }
  return body as T;
}

/** POST with no body (only the CSRF header). Throws `ApiError(fallback)` on a non-2xx answer. */
export async function postEmpty(url: string, fallback = "store"): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "application/json", "x-csrf": readCsrf() },
  });
  if (!res.ok) throw new ApiError(fallback, {}, res.status);
}

/** The error code from a thrown value (`ApiError` message), or "". */
export function errorCode(err: unknown): string {
  return err instanceof Error ? err.message : "";
}

export interface AdminRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Call `/api/admin/*` with CSRF header (`x-csrf`), `same-origin` credentials, and `{ error }` parsing.
 */
export async function adminApi<T = Record<string, unknown>>(
  url: string,
  options: AdminRequestOptions = {},
): Promise<T> {
  const method = options.method ?? (options.body !== undefined ? "POST" : "GET");
  const headers: Record<string, string> = {
    accept: "application/json",
    "x-csrf": readCsrf(),
  };
  let payload: string | undefined;
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(options.body);
  }
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    signal: options.signal,
    headers,
    body: payload,
  });
  const body = await readBody(res);
  if (!res.ok) {
    const code =
      typeof body.error === "string" && body.error ? body.error : `HTTP ${res.status}`;
    throw new ApiError(code, body, res.status);
  }
  if (method !== "GET") {
    try {
      localStorage.setItem("kdeenoff-data-rev", String(Date.now()));
    } catch {
      /* ignore */
    }
    try {
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("kdeenoff-admin");
        bc.postMessage({ at: Date.now(), url, method });
        bc.close();
      }
    } catch {
      /* ignore */
    }
  }
  return body as T;
}

/**
 * Call `/api/raffles/manage/*` for Streamers and Admins with CSRF + live data revision broadcast.
 */
export const streamerApi = adminApi;
