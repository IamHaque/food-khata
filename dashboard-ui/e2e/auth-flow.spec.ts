import { test, expect } from "@playwright/test";
import { spawn, ChildProcess } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const SERVER = path.join(ROOT, "tests", "e2e_access", "server.py");
const UI = "http://127.0.0.1:4173";

let backendBase = "";

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
  });
}

async function startBackend(switchOn: boolean): Promise<{ base: string; dataDir: string; stop: () => Promise<void> }> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fk-auth-"));
  const port = await freePort();
  const env: NodeJS.ProcessEnv = { ...process.env, PYTHONPATH: ROOT };
  if (switchOn) env.FOOD_KHATA_ENABLE_FAKE_PROVIDER = "1";
  const args = [SERVER, dataDir, String(port)];
  if (switchOn) args.push("--enable-fake-provider");
  const pythonBin = process.env.PYTHON || path.join(ROOT, "venv", "bin", "python");
  const proc: ChildProcess = spawn(pythonBin, args, { cwd: ROOT, env: { ...env, PATH: path.join(ROOT, "venv", "bin") + ":" + (env.PATH || "") }, stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(base + "/health");
      if (res.ok) break;
    } catch {
      /* not ready */
    }
    if (proc.exitCode !== null || i === 99) throw new Error("backend did not start");
    await new Promise((r) => setTimeout(r, 100));
  }
  return {
    base,
    dataDir,
    stop: async () => {
      proc.kill();
      await new Promise<void>((r) => proc.once("exit", () => r()));
    },
  };
}

async function claimOwner(page: import("@playwright/test").Page) {
  await page.goto(UI + "/welcome");
  await page.locator("#field-username").fill("owner");
  await page.locator("#field-password").fill("synthetic-owner-password");
  await page.locator("#field-confirm-password").fill("synthetic-owner-password");
  await page.getByRole("button", { name: "Claim owner" }).click();
}

async function loginOwner(page: import("@playwright/test").Page) {
  await page.locator("#login-username").fill("owner");
  await page.locator("#login-password").fill("synthetic-owner-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
}

test("one clean login (regression guard)", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const srv = await startBackend(false);
    backendBase = srv.base;
    await page.route("**/api/**", async (route) => {
      const u = new URL(route.request().url());
      await route.continue({ url: backendBase + u.pathname + u.search });
    });
    const navigations: string[] = [];
    const apiStatuses: { url: string; status: number; time: number }[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        const u = new URL(frame.url());
        navigations.push(u.pathname + u.search);
      }
    });
    page.on("response", (res) => {
      const u = new URL(res.url());
      if (u.pathname.startsWith("/api/")) apiStatuses.push({ url: u.pathname + u.search, status: res.status(), time: Date.now() });
    });

    await page.context().clearCookies();
    await page.goto(UI + "/welcome");
    await claimOwner(page);
    await page.waitForURL(/\/login/, { timeout: 10000 });
    const beforeLogin = navigations.filter((p) => /^\/login/.test(p)).length;
    const loginStartedAt = Date.now();
    await loginOwner(page);
    await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 10000 });
    const loginVisits = navigations.filter((p) => /^\/login/.test(p)).length;
    const forbidden401 = apiStatuses.filter((s) => s.status === 401 && s.time >= loginStartedAt);
    expect(forbidden401, "401 after login").toEqual([]);
    expect(loginVisits, "login visited more than once").toBeLessThanOrEqual(beforeLogin + 1);
    await srv.stop();
  }
});

test("[PR-02] restart keeps one redirect and one clean login", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const srv1 = await startBackend(false);
    backendBase = srv1.base;
    await page.route("**/api/**", async (route) => {
      const u = new URL(route.request().url());
      await route.continue({ url: backendBase + u.pathname + u.search });
    });
    const navigations: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        const u = new URL(frame.url());
        navigations.push(u.pathname + u.search);
      }
    });

    await page.context().clearCookies();
    await page.goto(UI + "/welcome");
    await claimOwner(page);
    await page.waitForURL(/\/login/, { timeout: 10000 });
    await loginOwner(page);
    await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 10000 });
    await page.goto(UI + "/home");

    const beforeRestart = navigations.length;
    await srv1.stop();
    const srv2 = await startBackend(false);
    backendBase = srv2.base;
    navigations.length = 0;
    await page.reload();
    await page.waitForURL(/\/login/, { timeout: 10000 });
    const redirects = navigations.filter((p) => /^\/login/.test(p)).length;
    expect(redirects, "expected one redirect to /login").toBe(1);
    await loginOwner(page);
    await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 10000 });
    const extraLogins = navigations.filter((p) => /^\/login/.test(p)).length;
    expect(extraLogins, "expected one clean login after redirect").toBeLessThanOrEqual(1);
    await srv2.stop();
  }
});

test("[PR-03] auth flows land on /home", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const srv = await startBackend(false);
    backendBase = srv.base;
    await page.route("**/api/**", async (route) => {
      const u = new URL(route.request().url());
      await route.continue({ url: backendBase + u.pathname + u.search });
    });
    await page.context().clearCookies();
    await page.goto(UI + "/welcome");
    await claimOwner(page);
    await page.waitForURL(/\/login|\/home/, { timeout: 10000 });
    await loginOwner(page);
    await expect(page).toHaveURL(/\/home(?:\?|$)/, { timeout: 10000 });
    await srv.stop();
  }
});

test("[PR-04]/[PR-05] U-3 switch off: providers from API, no fake, no All row", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const srv = await startBackend(false);
    backendBase = srv.base;
    await page.route("**/api/**", async (route) => {
      const u = new URL(route.request().url());
      await route.continue({ url: backendBase + u.pathname + u.search });
    });
    const providerRequests: { url: string; status: number; body: string }[] = [];
    page.on("response", async (res) => {
      const u = new URL(res.url());
      if (u.pathname === "/api/accounts/providers") {
        providerRequests.push({ url: u.pathname, status: res.status(), body: await res.text().catch(() => "") });
      }
    });

    await page.context().clearCookies();
    await page.goto(UI + "/welcome");
    await claimOwner(page);
    await page.waitForURL(/\/login/, { timeout: 10000 });
    await loginOwner(page);
    await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 10000 });

    await page.goto(UI + "/accounts/link");
    await expect(page.getByRole("heading", { name: "Link account" })).toBeVisible({ timeout: 10000 });
    expect(providerRequests.length, "GET /api/accounts/providers must be called").toBeGreaterThan(0);
    expect(providerRequests.some((r) => r.body.includes("fake")), "provider list must not include fake").toBe(false);
    await expect(page.locator("#provider")).not.toHaveText(/fake/i);
    await expect(page.getByRole("option", { name: /fake/i })).toHaveCount(0);

    // link one account via zomato (available when switch is off)
    await page.locator("#provider").click();
    await page.getByRole("option", { name: /zomato/i }).click();
    await page.locator("#phone").fill("9876543210");
    await page.getByRole("button", { name: "Send code" }).click();
    await page.locator("#code").fill("123456");
    await page.getByRole("button", { name: "Verify", exact: true }).click();
    await page.waitForURL(/\/home/, { timeout: 10000 });

    await page.goto(UI + "/");
    await expect(page.getByText(/^Account:/)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "All Accounts" })).toHaveCount(0);
    await srv.stop();
  }
});

test("[PR-04] switch on includes fake and linking works", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const srv = await startBackend(true);
    backendBase = srv.base;
    await page.route("**/api/**", async (route) => {
      const u = new URL(route.request().url());
      await route.continue({ url: backendBase + u.pathname + u.search });
    });
    const providerRequests: { body: string }[] = [];
    page.on("response", async (res) => {
      const u = new URL(res.url());
      if (u.pathname === "/api/accounts/providers") {
        providerRequests.push({ body: await res.text().catch(() => "") });
      }
    });

    await page.context().clearCookies();
    await page.goto(UI + "/welcome");
    await claimOwner(page);
    await page.waitForURL(/\/login/, { timeout: 10000 });
    await loginOwner(page);
    await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 10000 });

    await page.goto(UI + "/accounts/link");
    await expect(page.getByRole("heading", { name: "Link account" })).toBeVisible({ timeout: 10000 });
    expect(providerRequests.length, "GET /api/accounts/providers must be called").toBeGreaterThan(0);
    expect(providerRequests.some((r) => r.body.includes("fake")), "provider list must include fake").toBe(true);

    await page.locator("#provider").click();
    await page.getByRole("option", { name: /fake/i }).click();
    await page.locator("#phone").fill("9876543210");
    await page.getByRole("button", { name: "Send code" }).click();
    await page.locator("#code").fill("123456");
    await page.getByRole("button", { name: "Verify", exact: true }).click();
    await expect(page.getByText("Linked successfully")).toBeVisible({ timeout: 10000 });
    await srv.stop();
  }
});
