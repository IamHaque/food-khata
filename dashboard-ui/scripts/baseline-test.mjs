import { chromium } from "@playwright/test";
import { preview } from "vite";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { validateData } from "../src/loader.js";

const root = resolve(import.meta.dirname, "..");
const data = validateData(JSON.parse(readFileSync(resolve(root, "../.test-tmp/synthetic/dashboard.json"), "utf8")));
const axePath = process.env.AXE_CORE_PATH;
if (!axePath) throw new Error("Set AXE_CORE_PATH to a local axe-core axe.min.js");
const output = resolve(root, "test-results/synthetic-baseline");
mkdirSync(output, { recursive: true });
let server, browser;
const results = [];
try {
  server = await preview({ root, preview: { host: "127.0.0.1", port: 0, open: false } });
  const url = server.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  for (const theme of ["light", "dark"]) for (const width of [360, 768, 1280, 1920]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", colorScheme: theme });
    const page = await context.newPage();
    const blocked = [], errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => {
      const requestUrl = route.request().url();
      if (requestUrl === new URL("data/dashboard.json", url).href) return route.fulfill({ json: data });
      const parsed = new URL(requestUrl);
      if (parsed.origin === new URL(url).origin && (parsed.pathname === "/" || parsed.pathname.startsWith("/assets/"))) return route.continue();
      blocked.push(parsed.origin + parsed.pathname);
      return route.abort();
    });
    await page.addInitScript(value => localStorage.setItem("food-khata-theme", value), theme);
    await page.goto(url);
    await page.getByRole("combobox", { name: "Customer", exact: true }).waitFor();
    assert.equal(await page.locator("html").evaluate(e => e.classList.contains("dark")), theme === "dark");
    assert.equal(await page.locator("tbody tr").count(), 20);
    await page.screenshot({ path: resolve(output, `${theme}-${width}.png`), fullPage: true });
    await page.addScriptTag({ path: axePath });
    const contrast = await page.evaluate(() => {
      const color = value => {
        const element = document.createElement("span");
        element.style.color = value;
        document.body.append(element);
        const rgb = getComputedStyle(element).color.match(/\d+(?:\.\d+)?/g).slice(0, 3).map(Number);
        element.remove();
        return rgb;
      };
      const luminance = rgb => rgb.map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
      const token = name => `hsl(var(--${name}))`;
      const pairs = [
        ["foreground/background", token("foreground"), token("background"), 4.5],
        ["card-foreground/card", token("card-foreground"), token("card"), 4.5],
        ["muted-foreground/card", token("muted-foreground"), token("card"), 4.5],
        ["primary-foreground/primary", token("primary-foreground"), token("primary"), 4.5],
        ["ring/background", token("ring"), token("background"), 3],
        ["focus-outline/background", "#10a67b", token("background"), 3],
        ...["#10a67b", "#58bda0", "#9bd4bf", "#d5aa79", "#b8a39b", "#777f78"].map(c => [`chart ${c}/background`, c, token("background"), 3]),
      ];
      return pairs.map(([name, foreground, background, threshold]) => {
        const values = [luminance(color(foreground)), luminance(color(background))].sort((a, b) => b - a);
        const ratio = (values[0] + 0.05) / (values[1] + 0.05);
        return { name, ratio: Number(ratio.toFixed(2)), threshold, pass: ratio >= threshold };
      });
    });
    const axe = await page.evaluate(async () => {
      const result = await window.axe.run();
      return { violations: result.violations.map(({ id, impact, nodes }) => ({ id, impact, count: nodes.length })), incomplete: result.incomplete.map(({ id, nodes }) => ({ id, count: nodes.length })) };
    });
    assert.deepEqual(errors, []);
    results.push({ theme, width, blocked, contrast, ...axe });
    console.log(`${theme} ${width}: ${axe.violations.length} violation types, ${axe.violations.reduce((n, v) => n + v.count, 0)} nodes, ${blocked.length} blocked requests`);
    await context.close();
  }
  writeFileSync(resolve(output, "results.json"), JSON.stringify(results, null, 2) + "\n");
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(done => server.httpServer.close(done));
}
