import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const fixture = 'src/features/access/owner/.scenario-entry.tsx';
const html = '.owner-scenario.html';
await writeFile(fixture, `import React from 'react'; import {createRoot} from 'react-dom/client'; import {QueryClient,QueryClientProvider} from '@tanstack/react-query'; import {MemoryRouter} from 'react-router-dom'; import OwnerSettings from './OwnerSettings'; import '../../../style.css'; createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><OwnerSettings /></MemoryRouter></QueryClientProvider>);`);
await writeFile(html, `<div id="root"></div><script type="module" src="/src/features/access/owner/.scenario-entry.tsx"></script>`);
let server, browser;
try {
  server = await createServer({ server: { port: 0, host: '127.0.0.1' } }); await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  await mkdir('test-results/owner', { recursive: true });
  let owner = true, windowStatus = { is_open: false, remaining_seconds: null, until_closed: false }, disabled = false, calls = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-write', 'clipboard-read'] });
  await context.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname; if (!path.startsWith('/api/')) return route.continue(); const body = req.postDataJSON(); calls.push([path, body]);
    let data;
    if (path === '/api/auth/me') data = { id: 'owner', username: 'owner', is_owner: owner, disabled: false, created_at: '' };
    else if (path === '/api/auth/csrf') data = { csrf_token: 'synthetic' };
    else if (path === '/api/owner/status') data = { window: windowStatus, has_join_code: true, user_count: 2, max_users: 8 };
    else if (path === '/api/owner/users') data = [{ id: 'owner', username: 'owner', is_owner: true, disabled: false, created_at: '' }, { id: 'user', username: 'alice', is_owner: false, disabled, created_at: '' }];
    else if (path === '/api/owner/window') { windowStatus = { is_open: body.action !== 'close', remaining_seconds: body.duration_seconds ?? null, until_closed: body.action !== 'close' && body.duration_seconds == null }; data = windowStatus; }
    else if (path === '/api/owner/join-code/rotate') data = { join_code: 'TEST-1234' };
    else if (path.endsWith('/disable')) { disabled = body.disabled; data = {}; }
    else if (path.endsWith('/reset-password')) data = { status: 'ok', user_id: 'user', temporary_password: 'synthetic-password' };
    else throw new Error('Unexpected API: ' + path);
    await route.fulfill({ json: data });
  });
  const page = await context.newPage(); await page.goto(server.resolvedUrls.local[0] + html); await page.getByText('alice').waitFor();
  for (const [label, value] of [['15 min', 900], ['1 hour', 3600], ['Until closed', null]]) { await page.getByRole('button', { name: label }).click(); await page.waitForTimeout(100); assert.equal(calls.filter(c => c[0] === '/api/owner/window').at(-1)[1].duration_seconds, value); }
  assert(await page.getByText('Open until closed').isVisible()); await page.getByRole('button', { name: 'Close', exact: true }).click(); await page.getByText('Closed', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Rotate and reveal' }).click(); await page.getByText('TEST-1234').waitFor(); await page.getByRole('button', { name: 'Copy' }).click(); await page.getByText('Join code copied.').waitFor(); assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'TEST-1234');
  await page.getByRole('button', { name: 'Disable' }).click(); await page.getByRole('button', { name: 'Enable' }).waitFor(); await page.getByRole('button', { name: 'Enable' }).click(); await page.getByRole('button', { name: 'Disable' }).waitFor();
  await page.getByRole('button', { name: 'Reset password' }).click(); await page.getByText(/wipes the user's provider sessions/).waitFor(); await page.getByLabel('Owner password').fill('synthetic-owner-password'); await page.getByRole('button', { name: 'Confirm reset' }).click(); await page.getByText('synthetic-password').waitFor(); assert.equal(calls.filter(c => c[0].endsWith('/reset-password')).at(-1)[1].owner_password, 'synthetic-owner-password');
  await page.screenshot({ path: 'test-results/owner/owner-1440.png', fullPage: true }); await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: 'test-results/owner/owner-390.png', fullPage: true });
  windowStatus = { is_open: true, remaining_seconds: 2, until_closed: false }; await page.reload(); await page.getByText('Time left: 0:02').waitFor(); await page.getByText('Time left: 0:01').waitFor(); await page.getByText('Closed', { exact: true }).waitFor();
  await page.route('**/api/owner/users/user/reset-password', route => route.fulfill({ status: 403, json: { detail: 'Wrong owner password' } }));
  await page.getByRole('button', { name: 'Reset password' }).click(); await page.getByLabel('Owner password').fill('wrong'); await page.getByRole('button', { name: 'Confirm reset' }).click(); await page.getByRole('dialog').getByRole('alert').waitFor(); assert(await page.getByRole('dialog').isVisible()); await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.route('**/api/owner/join-code/rotate', route => route.fulfill({ status: 500, json: { detail: 'Rotation failed' } })); await page.getByRole('button', { name: 'Rotate and reveal' }).click(); await page.getByRole('alert').waitFor(); assert.equal(await page.getByText('TEST-1234').count(), 0);
  owner = false; calls = []; await page.reload(); await page.getByText('Owner access required.').waitFor(); assert(!calls.some(c => c[0].startsWith('/api/owner/')));
  console.log('Owner scenarios passed: windows, rotate/copy, disable/enable, reset, non-owner guard.');
} finally { await browser?.close(); await server?.close(); await rm(fixture, { force: true }); await rm(html, { force: true }); }
