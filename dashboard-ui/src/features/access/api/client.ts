import type { operations, components } from "../../../types/api";
import { z } from "zod";

export class ApiError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly retryAfter?: number;
  constructor(status: number, message: string, code?: string, retryAfter?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

const CSRF_HEADER = "x-csrf-token";
let csrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

async function refreshCsrf(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/csrf", { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as { csrf_token?: string };
    if (data?.csrf_token) {
      csrfToken = data.csrf_token;
      return csrfToken;
    }
    return null;
  } catch {
    return null;
  }
}

// Set by the router (useSessionExpiry); a 401 is handled once, without a page reload.
let onUnauthorized: ((code?: string) => void) | null = null;
let expiryHandled = false;

export function setUnauthorizedHandler(fn: ((code?: string) => void) | null) {
  onUnauthorized = fn;
  expiryHandled = false;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

export async function request<T = unknown>(path: string, opts: RequestOptions = {}, csrfRetried = false): Promise<T> {
  const method = (opts.method ?? "GET").toUpperCase();
  const needsCsrf = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
  if (needsCsrf && !csrfToken) {
    await refreshCsrf();
  }
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (needsCsrf && csrfToken) headers[CSRF_HEADER] = csrfToken;

  const res = await fetch(path, {
    method,
    credentials: "include",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const errObj = (data as any)?.error;
    const code =
      errObj?.code ??
      (data as any)?.code ??
      (data as any)?.detail?.code ??
      (data as any)?.error_code;
    const message =
      errObj?.message ??
      (data as any)?.detail?.message ??
      (data as any)?.detail ??
      (data as any)?.message ??
      res.statusText;

    if (res.status === 403 && needsCsrf && !csrfRetried && code === "forbidden") {
      csrfToken = null; // stale token (e.g. after a restart): refresh once and retry once
      return request<T>(path, opts, true);
    }
    // /auth/me is handled by RequireAuth and a failed login by its form.
    if (res.status === 401 && path !== "/api/auth/login" && path !== "/api/auth/me" && !expiryHandled) {
      expiryHandled = true;
      onUnauthorized?.(code ? String(code) : undefined);
    }

    const retryHeader = res.headers.get("retry-after") ?? res.headers.get("Retry-After");
    const parsedRetry = retryHeader ? parseInt(retryHeader, 10) : undefined;
    const retryAfter = Number.isFinite(parsedRetry) ? parsedRetry : undefined;

    throw new ApiError(
      res.status,
      typeof message === "string" ? message : JSON.stringify(message),
      code ? String(code) : undefined,
      retryAfter,
    );
  }

  return data as T;
}

// Typed convenience wrappers generated from OpenAPI paths
export const authApi = {
  async csrf() {
    const data = await request<{ csrf_token: string }>("/api/auth/csrf");
    if (data?.csrf_token) setCsrfToken(data.csrf_token);
    return data;
  },
  async login(username: string, password: string) {
    const data = await request<{ user: components["schemas"]["food_khata__serve__routes_auth__UserResponse"]; csrf_token: string }>("/api/auth/login", {
      method: "POST",
      body: { username, password },
    });
    expiryHandled = false;
    if (data?.csrf_token) setCsrfToken(data.csrf_token);
    return data;
  },
  async logout() {
    return request("/api/auth/logout", { method: "POST" });
  },
  async me() {
    return request<components["schemas"]["food_khata__serve__routes_auth__UserResponse"]>("/api/auth/me");
  },
  async setupStatus() {
    return request<components["schemas"]["SetupStatusResponse"]>("/api/auth/setup-status");
  },
  async register(username: string, password: string, join_code?: string) {
    return request<components["schemas"]["food_khata__serve__routes_auth__UserResponse"]>("/api/auth/register", {
      method: "POST",
      body: { username, password, join_code: join_code || undefined },
    });
  },
};

export const accountsApi = {
  async list() {
    return request<components["schemas"]["AccountOut"][]>("/api/accounts");
  },
  async providers() {
    return request<{ providers: string[] }>("/api/accounts/providers");
  },
  async linkStart(provider: string, phone: string) {
    return request<components["schemas"]["LinkStartResponse"]>("/api/accounts/link/start", {
      method: "POST",
      body: { provider, phone },
    });
  },
  async linkVerify(handle: string, code: string, account_name?: string) {
    return request<components["schemas"]["LinkVerifyResponse"]>("/api/accounts/link/verify", {
      method: "POST",
      body: { handle, code, account_name },
    });
  },
  async verifyAgain(accountId: string, provider?: string) {
    return request<components["schemas"]["VerifyAgainResponse"]>(`/api/accounts/${accountId}/verify-again`, {
      method: "POST",
      body: { provider },
    });
  },
  async disconnect(accountId: string, wipe_data = false, provider?: string) {
    return request<components["schemas"]["DisconnectResponse"]>(`/api/accounts/${accountId}/disconnect`, {
      method: "POST",
      body: { wipe_data, provider },
    });
  },
};

export const ownerApi = {
  async getSetup() {
    return request<{ has_owner: boolean; is_loopback: boolean }>("/api/owner/setup");
  },
  async setup(data: { username: string; password: string; setup_code?: string; adopt_data?: boolean }) {
    const user = await request<components["schemas"]["food_khata__serve__routes_owner__UserResponse"]>("/api/owner/setup", {
      method: "POST",
      body: data,
    });
    setCsrfToken(null);
    await refreshCsrf();
    return user;
  },
};

export type LoginRequest = components["schemas"]["LoginRequest"];
export type LoginResponse = components["schemas"]["LoginResponse"];
export type RegisterRequest = components["schemas"]["RegisterRequest"];
export type SetupStatusResponse = components["schemas"]["SetupStatusResponse"];
export type UserResponse = components["schemas"]["food_khata__serve__routes_auth__UserResponse"];
export type CsrfResponse = components["schemas"]["CsrfResponse"];
export type StatusResponse = components["schemas"]["StatusResponse"];
export { z };
export type { operations };
