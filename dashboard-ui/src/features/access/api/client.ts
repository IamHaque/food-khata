import type { operations, components } from "../../../types/api";
import { z } from "zod";

export class ApiError extends Error {
  public readonly status: number;
  public readonly code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
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

export interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

export async function request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
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

  if (res.status === 401) {
    const returnPath = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
    if (typeof window !== "undefined") {
      window.location.href = `/login?return=${encodeURIComponent(returnPath)}`;
    }
    throw new ApiError(401, "Unauthorized", "UNAUTHORIZED");
  }

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
    const code = (data as any)?.code ?? (data as any)?.detail?.code ?? (data as any)?.error_code;
    const message = (data as any)?.message ?? (data as any)?.detail ?? res.statusText;
    throw new ApiError(res.status, String(message), code ? String(code) : undefined);
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
    const data = await request<{ user: components["schemas"]["UserResponse"]; csrf_token: string }>("/api/auth/login", {
      method: "POST",
      body: { username, password },
    });
    if (data?.csrf_token) setCsrfToken(data.csrf_token);
    return data;
  },
  async logout() {
    return request("/api/auth/logout", { method: "POST" });
  },
  async me() {
    return request<components["schemas"]["UserResponse"]>("/api/auth/me");
  },
};

export type LoginRequest = components["schemas"]["LoginRequest"];
export type LoginResponse = components["schemas"]["LoginResponse"];
export type UserResponse = components["schemas"]["UserResponse"];
export type CsrfResponse = components["schemas"]["CsrfResponse"];
export type StatusResponse = components["schemas"]["StatusResponse"];
export { z };
export type { operations };
