import { afterEach, expect, it, vi } from "vitest";
import { accountsApi, authApi, getCsrfToken, ownerApi, setCsrfToken, setUnauthorizedHandler } from "./client";

afterEach(() => { vi.unstubAllGlobals(); setCsrfToken(null); });

it("refreshes the rotated CSRF token after owner setup", async () => {
  setCsrfToken("before-setup");
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: "owner" })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ csrf_token: "after-setup" }))));
  await ownerApi.setup({ username: "owner", password: "synthetic-password" });
  expect(getCsrfToken()).toBe("after-setup");
});

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status });

it("handles a 401 once, ignores /auth/me, and re-arms after login", async () => {
  const handler = vi.fn();
  setUnauthorizedHandler(handler);
  const expired = { error: { code: "SESSION_EXPIRED" } };
  vi.stubGlobal("fetch", vi.fn(async () => json(expired, 401)));
  await Promise.allSettled([accountsApi.list(), accountsApi.list(), authApi.me()]);
  expect(handler).toHaveBeenCalledTimes(1);
  expect(handler).toHaveBeenCalledWith("SESSION_EXPIRED");
  vi.stubGlobal("fetch", vi.fn(async () => json({ user: {}, csrf_token: "t" }, 200)));
  await authApi.login("u", "p");
  vi.stubGlobal("fetch", vi.fn(async () => json(expired, 401)));
  await accountsApi.list().catch(() => undefined);
  expect(handler).toHaveBeenCalledTimes(2);
  setUnauthorizedHandler(null);
});

it("refreshes a stale CSRF token once and retries once", async () => {
  setCsrfToken("stale");
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(json({ error: { code: "forbidden" } }, 403))
    .mockResolvedValueOnce(json({ csrf_token: "fresh" }, 200))
    .mockResolvedValueOnce(json({ ok: true }, 200));
  vi.stubGlobal("fetch", fetchMock);
  await authApi.logout();
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(fetchMock.mock.calls[2][1].headers["x-csrf-token"]).toBe("fresh");
  fetchMock.mockReset().mockImplementation(async () => json({ error: { code: "forbidden" } }, 403));
  setCsrfToken("stale");
  await expect(authApi.logout()).rejects.toMatchObject({ status: 403 });
});
