// PR-01: reproduction harness. The backend serves the built UI itself (run `npm run build` first),
// so each test talks to one real server on a free port with a throwaway data folder and no network.
import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SERVER = path.join(ROOT, "tests", "e2e_access", "server.py");
const PASSWORD = "synthetic-owner-password";

type Backend = { base: string; dataDir: string; port: number; stop: () => Promise<void> };

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

// Reusing dataDir and port is how a test restarts the server.
async function startBackend(switchOn: boolean, dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fk-auth-")), port?: number): Promise<Backend> {
  port ??= await freePort();
  const args = [SERVER, dataDir, String(port), ...(switchOn ? ["--enable-fake-provider"] : [])];
  const proc: ChildProcess = spawn(path.join(ROOT, ".venv", "bin", "python"), args, { cwd: ROOT, env: { ...process.env, PYTHONPATH: ROOT }, stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(base + "/health")).ok) break;
    } catch {
      /* not ready */
    }
    if (proc.exitCode !== null || i >= 100) throw new Error("backend did not start");
    await new Promise((r) => setTimeout(r, 100));
  }
  return {
    base,
    dataDir,
    port,
    stop: async () => {
      if (proc.exitCode !== null) return;
      proc.kill();
      await new Promise<void>((r) => proc.once("exit", () => r()));
    },
  };
}

async function claimOwner(page: Page, base: string) {
  await page.goto(base + "/welcome");
  await page.locator("#field-username").fill("owner");
  await page.locator("#field-password").fill(PASSWORD);
  await page.locator("#field-confirm-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Claim owner" }).click();
}

async function loginOwner(page: Page) {
  await page.locator("#login-username").fill("owner");
  await page.locator("#login-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
}

// Claim, then log in if the app asks for it (today it does; PR-03 changes that).
async function signedIn(page: Page, base: string) {
  await claimOwner(page, base);
  await page.waitForURL(/\/(login|home)/, { timeout: 10000 });
  if (page.url().includes("/login")) await loginOwner(page);
  await page.waitForURL((u) => u.pathname !== "/login", { timeout: 10000 });
}

async function linkAccount(page: Page, provider: RegExp) {
  await page.locator("#provider").click();
  await page.getByRole("option", { name: provider }).click();
  await page.locator("#phone").fill("9876543210");
  await page.getByRole("button", { name: "Send code" }).click();
  await page.locator("#code").fill("123456");
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page.getByText("Linked successfully")).toBeVisible({ timeout: 10000 });
}

function record(page: Page) {
  const navigations: string[] = [];
  const api: { url: string; status: number; time: number }[] = [];
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) navigations.push(new URL(f.url()).pathname);
  });
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/")) api.push({ url: u.pathname, status: r.status(), time: Date.now() });
  });
  return { api, logins: () => navigations.filter((p) => p === "/login").length };
}

for (const width of [1440, 390]) {
  test.describe(`${width}px`, () => {
    let srv: Backend;
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
    });
    test.afterEach(async () => srv?.stop());

    test("one clean login (regression guard)", async ({ page }) => {
      srv = await startBackend(false);
      const rec = record(page);
      await claimOwner(page, srv.base);
      await page.waitForURL(/\/(login|home)/, { timeout: 10000 });
      if (page.url().includes("/login")) {
        const startedAt = Date.now();
        const before = rec.logins();
        await loginOwner(page);
        await page.waitForURL((u) => u.pathname !== "/login", { timeout: 10000 });
        expect(rec.logins(), "login visited again").toBe(before);
        expect(rec.api.filter((r) => r.status === 401 && r.time >= startedAt), "401 after login").toEqual([]);
      }
    });

    test("[PR-02] restart gives one redirect and one clean login", async ({ page }) => {
      srv = await startBackend(false);
      await signedIn(page, srv.base);
      await srv.stop();
      srv = await startBackend(false, srv.dataDir, srv.port);
      const rec = record(page);
      await page.goto(srv.base + "/home");
      await page.waitForURL(/\/login/, { timeout: 10000 });
      await expect(page.getByText("Your session ended. Sign in again.")).toBeVisible();
      expect(rec.logins(), "exactly one redirect to /login").toBe(1);
      await loginOwner(page);
      await page.waitForURL((u) => u.pathname !== "/login", { timeout: 10000 });
      expect(rec.logins(), "no second login prompt").toBe(1);
    });

    test("[PR-03] setup and login land on /home", async ({ page }) => {
      srv = await startBackend(false);
      await claimOwner(page, srv.base);
      await expect(page, "setup lands on /home").toHaveURL(/\/home$/, { timeout: 10000 });
      await page.context().clearCookies();
      await page.goto(srv.base + "/login");
      await loginOwner(page);
      await expect(page, "login lands on /home").toHaveURL(/\/home$/, { timeout: 10000 });
    });

    test("[PR-04][PR-05] switch off: server-driven list, nothing preselected, no aggregate row", async ({ page }) => {
      srv = await startBackend(false);
      await signedIn(page, srv.base);
      const list = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/accounts/providers");
      await page.goto(srv.base + "/accounts/link");
      await expect(page.getByRole("heading", { name: "Link account" })).toBeVisible({ timeout: 10000 });
      expect((await (await list).json()).providers).not.toContain("fake");
      await expect(page.locator("#provider")).not.toHaveText(/fake/i);
      await expect(page.getByRole("button", { name: "Send code" })).toBeDisabled();
      await page.locator("#provider").click();
      await expect(page.getByRole("option", { name: /fake/i })).toHaveCount(0);
      await page.keyboard.press("Escape");
      await linkAccount(page, /zomato/i);
      await page.goto(srv.base + "/");
      await expect(page.getByRole("button", { name: /All (my )?accounts/i })).toHaveCount(0);
    });

    test("[PR-04] switch on: list includes fake and linking works", async ({ page }) => {
      srv = await startBackend(true);
      await signedIn(page, srv.base);
      await page.goto(srv.base + "/accounts/link");
      await linkAccount(page, /fake/i);
    });
  });
}
