import { afterEach, expect, it, vi } from "vitest";
import { getCsrfToken, ownerApi, setCsrfToken } from "./client";

afterEach(() => { vi.unstubAllGlobals(); setCsrfToken(null); });

it("refreshes the rotated CSRF token after owner setup", async () => {
  setCsrfToken("before-setup");
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: "owner" })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ csrf_token: "after-setup" }))));
  await ownerApi.setup({ username: "owner", password: "synthetic-password" });
  expect(getCsrfToken()).toBe("after-setup");
});
