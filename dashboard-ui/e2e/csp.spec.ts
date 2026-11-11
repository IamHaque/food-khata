// PR-15: the built UI must run under the server's Content-Security-Policy with no violations.
import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("built UI runs under the CSP without violations", async ({ page }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fk-csp-"));
  const port = 8780 + Math.floor(Math.random() * 100);
  const proc = spawn(path.join(ROOT, ".venv", "bin", "python"), [path.join(ROOT, "tests", "e2e_access", "server.py"), dir, String(port)], { cwd: ROOT, env: { ...process.env, PYTHONPATH: ROOT }, stdio: "ignore" });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) { try { if ((await fetch(base + "/health")).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
    const problems: string[] = [];
    page.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text()); });
    page.on("pageerror", (e) => problems.push(e.message));
    const res = await page.goto(base + "/welcome");
    expect(res?.headers()["content-security-policy"]).toContain("script-src 'self'");
    await page.locator("#field-username").fill("owner");
    await page.locator("#field-password").fill("synthetic-owner-password");
    await page.locator("#field-confirm-password").fill("synthetic-owner-password");
    await page.getByRole("button", { name: "Claim owner" }).click();
    await page.waitForURL(/\/home/, { timeout: 10000 });
    await page.goto(base + "/");
    await page.waitForLoadState("networkidle");
    expect(problems).toEqual([]);
  } finally {
    proc.kill();
  }
});
