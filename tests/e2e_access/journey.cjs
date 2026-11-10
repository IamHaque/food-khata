// Run from the repository root after building dashboard-ui.
const { createRequire } = require('node:module');
const { spawn } = require('node:child_process');
const { mkdtempSync, mkdirSync } = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { chromium } = createRequire(path.resolve('dashboard-ui/package.json'))('@playwright/test');
const assert = require('node:assert/strict');

async function run(width) {
  const output = path.resolve('dashboard-ui/test-results');
  mkdirSync(output, { recursive: true });
  const root = mkdtempSync(path.join(output, 'synthetic-access-'));
  const port = await new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once('error', reject).listen(0, '127.0.0.1', () => {
      const port = socket.address().port;
      socket.close(() => resolve(port));
    });
  });
  const url = `http://127.0.0.1:${port}`;
  const server = spawn('python', ['tests/e2e_access/server.py', root, String(port)], { stdio: 'pipe', env: { ...process.env, PYTHONPATH: process.cwd() } });
  let logs = '';
  server.stdout.on('data', data => { logs += data; });
  server.stderr.on('data', data => { logs += data; });
  let browser;
  try {
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(url + '/health')).ok) break; } catch {}
      if (server.exitCode !== null || i === 99) throw new Error('Synthetic server did not start: ' + logs);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await page.goto(url + '/welcome');
    await page.waitForURL('**/setup');
    await page.locator('#field-username').fill('owner');
    await page.locator('#field-password').fill('synthetic-owner-password');
    await page.locator('#field-confirm-password').fill('synthetic-owner-password');
    await page.getByRole('button', { name: 'Claim owner' }).click();
    await page.waitForURL('**/login?setup=complete');
    await page.locator('#login-username').fill('owner');
    await page.locator('#login-password').fill('synthetic-owner-password');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.waitForURL(url + '/', { timeout: 8000 }).catch(async error => { console.error(await page.locator('body').innerText()); throw error; });
    await page.goto(url + '/settings');
    await page.getByRole('button', { name: '15 min' }).click();
    await page.getByText(/Time left:/).waitFor();
    const guest = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    guest.on('response', async response => {
      if (response.url().endsWith('/api/dashboard') && !response.ok()) console.error('Dashboard response:', response.status(), await response.text());
    });
    await guest.goto(url + '/register');
    await guest.getByText('Registration window is open.', { exact: false }).waitFor();
    await guest.locator('#reg-username').fill('guest');
    await guest.locator('#reg-password').fill('synthetic-guest-password');
    await guest.locator('#reg-confirm-password').fill('synthetic-guest-password');
    await guest.getByRole('checkbox').check();
    await guest.getByRole('button', { name: 'Register', exact: true }).click();
    await guest.waitForURL('**/login?registered=true');
    await guest.locator('#login-username').fill('guest');
    await guest.locator('#login-password').fill('synthetic-guest-password');
    await guest.getByRole('button', { name: 'Log in', exact: true }).click();
    await guest.waitForURL(url + '/');
    await guest.goto(url + '/accounts/link');
    await guest.getByRole('combobox', { name: 'Provider' }).click();
    await guest.getByRole('option', { name: 'Zomato' }).click();
    await guest.locator('#phone').fill('9876543210');
    await guest.getByRole('button', { name: 'Send code' }).click();
    await guest.locator('#code').fill('123456');
    await guest.getByRole('button', { name: 'Verify', exact: true }).click();
    await guest.waitForURL('**/home');
    const accounts = await guest.evaluate(() => fetch('/api/accounts').then(r => r.json()));
    assert.equal(accounts.length, 1);
    await guest.goto(url + '/sync?account=' + encodeURIComponent(accounts[0].id));
    await guest.getByRole('button', { name: 'Start sync' }).click();
    await guest.getByText('Sync complete. Your dashboard is ready.').waitFor({ timeout: 60000 });
    await guest.goto(url + '/');
    await guest.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
    await guest.getByText('Total Orders', { exact: true }).first().waitFor({ timeout: 10000 }).catch(async error => { console.error(await guest.locator('body').innerText()); throw error; });
    const dashboard = await guest.evaluate(async () => {
      const csrf = await fetch('/api/auth/csrf').then(r => r.json());
      return fetch('/api/dashboard', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf.csrf_token }, body: '{}' }).then(r => r.json());
    });
    assert.ok(JSON.stringify(dashboard).includes('1000'), 'dashboard must contain imported data');
    const jobs = await guest.evaluate(() => fetch('/api/sync/jobs').then(r => r.json()));
    const orders = await guest.evaluate(() => fetch('/api/orders').then(r => r.json()));
    const guestId = await guest.evaluate(() => fetch('/api/auth/me').then(r => r.json()).then(u => u.id));
    const isolation = await page.evaluate(async ({ account, job, guestId, order }) => {
      const get = async p => { const r = await fetch(p); return { status: r.status, body: await r.text() }; };
      const csrf = await fetch('/api/auth/csrf').then(r => r.json());
      const dashboard = await fetch('/api/dashboard', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf.csrf_token }, body: '{}' });
      const post = async p => (await fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf.csrf_token }, body: JSON.stringify({ code: '123456' }) })).status;
      return {
        accounts: await get('/api/accounts'), jobs: await get('/api/sync/jobs'),
        dashboard: { status: dashboard.status, body: await dashboard.text() },
        job: await get('/api/sync/jobs/' + job), events: await get('/api/sync/jobs/' + job + '/events'),
        bill: await get('/api/orders/' + encodeURIComponent(order) + '/bill'),
        file: await get('/data/users/' + guestId + '/accounts/' + account + '/account.json'),
        directFile: await get('/users/' + guestId + '/accounts/' + account + '/account.json'),
        views: await Promise.all(['/api/orders', '/api/orders/slim', '/api/restaurants', '/api/items', '/api/meta/filters', '/api/meta/data-health'].map(get)),
        actions: await Promise.all(['/api/accounts/' + account + '/disconnect', '/api/accounts/' + account + '/verify-again', ...['cancel', 'pause', 'resume', 'code', 'use-partial', 'discard-partial'].map(a => '/api/sync/jobs/' + job + '/' + a)].map(post)),
      };
    }, { account: accounts[0].id, job: jobs[0].id, guestId, order: orders.rows[0].id });
    assert.ok(!isolation.accounts.body.includes(accounts[0].id));
    assert.ok(!isolation.jobs.body.includes(jobs[0].id));
    assert.ok(!isolation.dashboard.body.includes('Synthetic restaurant'));
    assert.equal(isolation.job.status, 404);
    assert.equal(isolation.events.status, 404);
    assert.notEqual(isolation.bill.status, 200);
    assert.equal(isolation.file.status, 404);
    assert.equal(isolation.directFile.status, 404);
    assert.ok(isolation.views.every(view => !view.body.includes('Synthetic restaurant') && !view.body.includes(accounts[0].id)));
    assert.ok(isolation.actions.every(status => status === 404), JSON.stringify(isolation.actions));
    await guest.screenshot({ path: path.resolve(`docs/access/journey-${width}.png`), fullPage: true });
    for (const secret of ['synthetic-owner-password', 'synthetic-guest-password', 'synthetic-token-canary', '123456']) {
      assert.ok(!logs.includes(secret), 'synthetic secret appeared in server logs');
    }
    console.log(`PASS synthetic journey ${width}`);
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

(async () => { for (const width of [1440, 390]) await run(width); })().catch(error => { console.error(error); process.exitCode = 1; });
