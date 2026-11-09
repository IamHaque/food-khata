// Run from dashboard-ui: node src/features/access/sync/browser-check.mjs
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realpathSync } from "node:fs";

const entry = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {BrowserRouter} from 'react-router-dom';
import Sync from '/src/features/access/sync/Sync.tsx';
import '/src/style.css';
createRoot(document.getElementById('root')).render(React.createElement(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false}}})},React.createElement(BrowserRouter,null,React.createElement(Sync))));
`;
const server = await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync("node_modules")] } }, plugins: [{
  name: "synthetic-sync-check",
  resolveId(id) { if (id === "/__sync_entry.jsx") return id; },
  load(id) { if (id === "/__sync_entry.jsx") return entry; },
  configureServer(vite) {
    vite.middlewares.use("/__sync_check", async (_req, res, next) => {
      if (_req.url?.includes("html-proxy")) return next();
      res.setHeader("Content-Type", "text/html");
      res.end(await vite.transformIndexHtml("/__sync_check", '<html><head></head><body><div id="root"></div><script type="module" src="/__sync_entry.jsx"></script></body></html>'));
    });
  },
}] });
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", error => console.error(error));
  const base = server.resolvedUrls.local[0];
  let status = "running";
  let decision = "pending";
  const calls = [];
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    calls.push([url.pathname, route.request().postDataJSON()]);
    if (url.pathname.endsWith("/csrf")) return route.fulfill({ json: { csrf_token: "synthetic" } });
    if (url.pathname.endsWith("/cancel")) status = "cancelled";
    if (url.pathname.endsWith("/resume") || url.pathname.endsWith("/code")) status = "running";
    if (url.pathname.endsWith("/discard-partial")) decision = "discarded";
    if (url.pathname.endsWith("/use-partial")) decision = "imported";
    return route.fulfill({ json: url.pathname.endsWith("/use-partial") ? { imported: 12, total: 12 } : { id: "synthetic", user_id: "synthetic", account_id: "synthetic", provider: "swiggy", mode: "new", status, partial_decision: decision, phase: "bills", counts: { orders: 12 } } });
  });
  const output = join(tmpdir(), "food-khata-ac15");
  await mkdir(output, { recursive: true });
  await page.goto(`${base}__sync_check?account=synthetic`);
  await page.getByRole("button", { name: "Start sync" }).waitFor();
  assert(await page.getByRole("radio", { name: /New orders/ }).isChecked());
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(output, `chooser-${width}.png`), fullPage: true });
  }
  await page.getByRole("radio", { name: /All history/ }).check();
  await page.getByRole("button", { name: "Start sync" }).click();
  await page.getByRole("button", { name: "Cancel sync" }).click();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await page.getByText(/Previously imported orders remain/).waitFor();
  await page.reload();
  await page.getByText(/Previously imported orders remain/).waitFor();
  assert.equal(await page.getByRole("button", { name: "Use partial data" }).count(), 0);
  assert(calls.some(([path, body]) => path === "/api/sync/jobs" && body?.mode === "all"));
  for (const next of ["needs_code", "interrupted", "failed"]) {
    status = next;
    decision = "pending";
    await page.goto(`${base}__sync_check?job=synthetic`);
    if (next === "needs_code") {
      await page.getByLabel("Provider verification code").fill("123456");
      await page.getByRole("button", { name: "Submit code" }).click();
      await page.getByText("swiggy · running").waitFor();
    } else if (next === "interrupted") {
      await page.getByRole("button", { name: "Resume after login" }).click();
      await page.getByText("swiggy · running").waitFor();
    } else {
      await page.getByRole("button", { name: "Use partial data" }).click();
      await page.getByText(/Partial data was imported/).waitFor();
      await page.reload();
      await page.getByText(/Partial data was imported/).waitFor();
      assert.equal(await page.getByRole("button", { name: "Discard", exact: true }).count(), 0);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.reload();
        await page.getByText(/Partial data was imported/).waitFor();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: join(output, `imported-${width}.png`), fullPage: true });
        decision = "discarded";
        await page.reload();
        await page.getByText(/Previously imported orders remain/).waitFor();
        await page.screenshot({ path: join(output, `discarded-${width}.png`), fullPage: true });
        decision = "imported";
      }
    }
  }
  console.log(`Synthetic browser interactions passed; screenshots: ${output}`);
} finally {
  await browser?.close();
  await server.close();
}
