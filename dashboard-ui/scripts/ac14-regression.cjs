const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Run against the Vite dev server; every API response is synthetic.
(async () => {
  const out = process.env.AC14_EVIDENCE || path.join(require('node:os').tmpdir(), 'ac14-evidence');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const calls = [];
      let error = null;
      let accounts = [{ id: 'local-42', local_id: 'local-42', provider: 'swiggy', phone: '9876543210', status: 'expired', last_sync: null, order_count: 12, has_session: false }];
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== 'http://127.0.0.1:4186') return route.abort();
        if (url.pathname.startsWith('/api/')) {
          const body = route.request().postDataJSON();
          calls.push({ path: url.pathname, body });
          let data = {}, status = 200;
          if (url.pathname === '/api/accounts') data = accounts;
          else if (url.pathname.endsWith('/csrf')) data = { csrf_token: 'mock' };
          else if (url.pathname.endsWith('/link/start')) data = { handle: 'issued-handle', expires_at: 9999999999 };
          else if (url.pathname.endsWith('/verify-again')) data = { handle: 'fresh-handle', expires_at: 9999999999, status: 'pending' };
          else if (url.pathname.endsWith('/link/verify')) {
            if (error) { status = error.status; data = { detail: { code: error.code, message: error.message } }; }
            else if (body.handle === 'fresh-handle') data = { status: 'ok' };
            else { accounts = [...accounts, { ...accounts[0], id: 'new', phone: '9123456789', status: 'ok' }]; data = { status: 'ok' }; }
          } else if (url.pathname.endsWith('/disconnect')) data = { status: 'ok', account_id: 'local-42', wiped: body.wipe_data };
          return route.fulfill({ status, json: data });
        }
        if (url.pathname === '/src/entry.tsx') {
          const response = await route.fetch();
          return route.fulfill({ response, body: (await response.text()).replace('import { App } from '+JSON.stringify('/src/app/App.tsx'), 'import { AccessRoutes as App } from '+JSON.stringify('/src/features/access/routes.tsx')) });
        }
        if (url.pathname === '/__review') return route.fulfill({ contentType: 'text/html', body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/@vite/client"></script></head><body><div id="root"></div><script>history.replaceState(null,"","/");</script><script type="module" src="/src/entry.tsx"></script></body></html>` });
        return route.continue();
      });
      await page.goto('http://127.0.0.1:4186/__review');
      await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Disconnect account?' });
      await dialog.waitFor();
      assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(out, `confirmation-${width}.png`), fullPage: true });
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await page.waitForFunction(() => document.activeElement?.textContent === 'Disconnect');
      await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
      await page.keyboard.press('Escape');
      assert.equal(await dialog.count(), 0);
      await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
      await dialog.getByRole('button', { name: 'Keep data' }).click();
      await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
      await dialog.getByRole('button', { name: 'Wipe data' }).click();
      assert.deepEqual(calls.filter(c => c.path.endsWith('/disconnect')).map(c => c.body.wipe_data), [false, true]);
      await page.getByRole('button', { name: 'Verify again' }).click();
      await page.getByLabel('SMS code').fill('123456');
      await page.screenshot({ path: path.join(out, `reverify-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Verify', exact: true }).click();
      await page.getByText('Verified successfully.').waitFor();
      assert.deepEqual(calls.filter(c => c.path.endsWith('/verify-again')).map(c => c.body), [{}]);
      assert.deepEqual(calls.filter(c => c.path.endsWith('/link/verify'))[0].body, { handle: 'fresh-handle', code: '123456' });
      await page.getByRole('button', { name: 'Link account', exact: true }).click();
      await page.getByLabel('Provider').click();
      await page.getByRole('option', { name: 'Swiggy' }).click();
      await page.getByLabel('Phone number').fill('9123456789');
      await page.screenshot({ path: path.join(out, `link-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Send code' }).click();
      await page.getByLabel('SMS OTP code').fill('000000');
      for (const e of [
        { status: 400, code: 'INVALID_OTP', message: 'Wrong code. Try again.' },
        { status: 409, code: 'QUOTA', message: 'Account quota exceeded (maximum 5 accounts allowed).' },
        { status: 409, code: 'PROVIDER_ACCOUNT_TAKEN', message: 'This provider account is already linked to another user.' },
        { status: 400, code: 'HANDLE_EXPIRED', message: 'Login handle has expired.' },
      ]) {
        error = e;
        await page.getByRole('button', { name: 'Verify', exact: true }).click();
        await page.getByRole('alert').getByText(e.code === 'HANDLE_EXPIRED' ? 'Handle expired. Please restart.' : e.message).waitFor();
        if (e.code === 'QUOTA') await page.screenshot({ path: path.join(out, `error-${width}.png`), fullPage: true });
      }
      error = null;
      await page.getByRole('button', { name: 'Send code' }).click();
      await page.getByLabel('SMS OTP code').fill('123456');
      await page.getByRole('button', { name: 'Verify', exact: true }).click();
      await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
      await page.getByText('9123456789', { exact: false }).waitFor();
      await page.screenshot({ path: path.join(out, `success-${width}.png`), fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      fs.writeFileSync(path.join(out, `calls-${width}.json`), JSON.stringify(calls, null, 2));
      await page.close();
      console.log(`${width}px: dialog, focus, disconnect, reverify, labels, errors and cache refresh passed`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
