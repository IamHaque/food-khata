import { test, expect } from '@playwright/test';
import { FILTERS, mockApi } from './mock-api';
for (const width of [1440, 390]) {
  test(`access integration ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mockApi(page);
    let user = 'A', status = 'running', orders = 0;
    let hold = false, release!: () => void, pending!: () => void;
    const waiting = new Promise<void>(resolve => { pending = resolve; });
    const delayed = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/**', async (route, request) => {
      const path = new URL(request.url()).pathname;
      if (path === '/api/meta/data-health') return route.fulfill({ json: { filters_applied: FILTERS, generated_at: new Date().toISOString(), imports: [], history_complete: true, details_complete: true, verified_percent: 100, null_rates: {}, duplicate_orders: 0, reconciliation_anomalies: 0, note: 'ok' } });
      if (path === '/api/auth/me') return user ? route.fulfill({ json: { id: user, username: user, is_owner: false, created_at: '' } }) : route.fulfill({ status: 401 });
      if (path === '/api/auth/csrf') return route.fulfill({ json: { csrf_token: 'fake' } });
      if (path === '/api/auth/login') { user = 'B'; return route.fulfill({ json: { user: { id: user }, csrf_token: 'fake' } }); }
      if (path === '/api/auth/logout') { user = ''; return route.fulfill({ json: {} }); }
      if (path === '/api/accounts') { const captured = user; if (hold && captured === 'A') { pending(); await delayed; } return route.fulfill({ json: [{ id: captured, local_id: captured, provider: 'fake', phone: `Account ${captured}`, status: 'ok', order_count: orders }] }).catch(() => {}); }
      if (path === '/api/sync/jobs') return route.fulfill({ json: [{ id: 'job 1', user_id: user, account_id: user, provider: 'fake', mode: 'new', status, partial_decision: 'pending', finished_at: Date.now() / 1000 }] });
      return route.fallback();
    });
    await page.goto('/');
    await expect(page.getByText('Fetching your first orders.', { exact: false })).toBeVisible();
    await expect(page.getByText('Account: Account A', { exact: false })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
    hold = true;
    await page.evaluate(() => { void (window as any).__queryClient.invalidateQueries({ queryKey: ['accounts'] }); });
    await waiting;
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page.getByText('Your sync continues after logout.', { exact: false })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/login/);
    await page.getByLabel('Username').fill('B');
    await page.getByLabel('Password').fill('password');
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page.getByText('Account: Account B', { exact: false })).toBeVisible();
    release();
    await expect(page.getByText('Account: Account A', { exact: false })).toHaveCount(0);
    orders = 1;
    await page.reload();
    await expect(page.getByText('Syncing orders in the background.', { exact: false })).toBeVisible();
    await expect(page.getByText('\u20b9100.00').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Sync status: Synced/ })).toBeVisible();
    await page.screenshot({ path: `test-results/access-${width}.png` });
    status = 'done';
    await page.reload();
    await expect(page.getByText('Sync complete.', { exact: false })).toBeVisible();
    await page.getByRole('link', { name: 'Home', exact: true }).first().click();
    await expect(page.getByRole('link', { name: 'Sync', exact: true })).toHaveAttribute('href', '/sync?account=B');
    await page.getByRole('link', { name: 'Sync', exact: true }).click();
    await expect(page.getByText('Choose a sync')).toBeVisible();
  });
}

test('guards routes and handles an empty user', async ({ page }) => {
  await mockApi(page);
  let signedIn = false;
  await page.route('**/api/**', async (route, request) => {
    const path = new URL(request.url()).pathname;
    if (path === '/api/auth/me') return signedIn ? route.fulfill({ json: { id: 'empty', username: 'empty', is_owner: false, created_at: '' } }) : route.fulfill({ status: 401 });
    if (path === '/api/accounts') return route.fulfill({ json: [] });
    return route.fallback();
  });
  await page.goto('/accounts');
  await expect(page).toHaveURL(/login/);
  signedIn = true;
  await page.goto('/');
  await expect(page.getByText('No linked accounts yet.', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'Go to Home to link an account' }).click();
  await expect(page).toHaveURL(/home/);
  await expect(page.getByRole('link', { name: 'Link your first account' })).toBeVisible();
});

test('linked accounts drive the filter and data health', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/accounts', route => route.fulfill({ json: [
    { id: 'a', local_id: 'a', provider: 'fake', phone: 'First linked', status: 'ok', order_count: 2 },
    { id: 'b', local_id: 'b', provider: 'fake', phone: 'Second linked', status: 'expired', order_count: 3 },
  ] }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await expect(page.getByRole('option', { name: /First linked/ })).toBeVisible();
  await page.getByRole('option', { name: /Second linked/ }).click();
  await expect(page).toHaveURL(/account_ids=b/);
  await page.getByRole('button', { name: /Open data health and sync panel/ }).click();
  await expect(page.getByText('fake · First linked · 2 orders · ok')).toBeVisible();
  await expect(page.getByText('fake · Second linked · 3 orders · expired')).toBeVisible();
});

test('cross-tab login clears filters and delayed data', async ({ context, page }) => {
  let user = 'A', hold = false;
  let release!: () => void, pending!: () => void;
  const waiting = new Promise<void>(resolve => { pending = resolve; });
  const delayed = new Promise<void>(resolve => { release = resolve; });
  const requests: string[] = [];
  const setup = async (tab: typeof page) => {
    await mockApi(tab);
    await tab.route('**/api/**', async (route, request) => {
      const url = new URL(request.url());
      if (user === 'B') requests.push(url.pathname + url.search);
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: { id: user, username: user, is_owner: false, created_at: '' } });
      if (url.pathname === '/api/auth/login') { user = 'B'; return route.fulfill({ json: { user: { id: user }, csrf_token: 'fake' } }); }
      if (url.pathname === '/api/accounts') {
        const captured = user;
        if (hold && captured === 'A') { pending(); await delayed; }
        return route.fulfill({ json: [{ id: captured, local_id: captured, provider: 'fake', phone: `Account ${captured}`, status: 'ok', order_count: 1 }] }).catch(() => {});
      }
      return route.fallback();
    });
  };
  await setup(page);
  await page.goto('/?restaurant_ids=A-private&account_ids=A');
  await expect(page.getByText('Account: Account A', { exact: false })).toBeVisible();
  hold = true;
  await page.evaluate(() => { void (window as any).__queryClient.invalidateQueries({ queryKey: ['accounts'] }); });
  await waiting;
  const other = await context.newPage();
  await setup(other);
  await other.goto('/login?return=%2Forders%3Frestaurant_ids%3DA-private%26account_ids%3DA');
  await other.getByLabel('Username').fill('B');
  await other.getByLabel('Password').fill('password');
  await other.getByRole('button', { name: /log in/i }).click();
  await expect(other).toHaveURL(/\/orders(?:\?|$)/);
  await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:4173\/(?:\?|$)/);
  expect(other.url()).not.toContain('A-private');
  expect(page.url()).not.toContain('A-private');
  await expect(page.getByText('Account: Account B', { exact: false })).toBeVisible();
  release();
  await expect(page.getByText('Account: Account A', { exact: false })).toHaveCount(0);
  expect(requests.join('\n')).not.toContain('A-private');
  expect(requests.join('\n')).not.toContain('account_ids=A');
});

test('sync banners show status, progress and per-user acknowledgement', async ({ page }) => {
  await mockApi(page);
  let user = 'A', count = 0, status = 'queued', finished = Date.now() / 1000, newerFailure = false, withCounts = true;
  await page.route('**/api/**', async (route, request) => {
    const path = new URL(request.url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { id: user, username: user, is_owner: false, created_at: '' } });
    if (path === '/api/accounts') return route.fulfill({ json: [{ id: user, local_id: user, provider: 'fake', phone: user, status: 'ok', order_count: count }] });
    if (path === '/api/sync/jobs') return route.fulfill({ json: [{ id: 'job 1', status, finished_at: finished, counts: withCounts ? { orders_found: 2 } : null, user_id: user, account_id: user, provider: 'fake', mode: 'new' }, ...(newerFailure ? [{ id: 'failure', status: 'failed', finished_at: finished + 1 }] : [])] });
    return route.fallback();
  });
  for (const data of [0, 1]) {
    count = data;
    for (const [state, message] of [['queued', 'Sync queued'], ['running', data ? 'Syncing orders' : 'Fetching your first orders'], ['paused', 'Sync paused'], ['needs_code', 'Sync needs your verification code']]) {
      status = state;
      await page.goto('/');
      await expect(page.getByText(message, { exact: false })).toBeVisible();
      await expect(page.getByText('orders found: 2', { exact: false })).toBeVisible();
      await expect(page.getByRole('link', { name: 'View sync' })).toHaveAttribute('href', '/sync?job=job%201');
    }
  }
  withCounts = false;
  await page.goto('/');
  await expect(page.getByText('Sync needs your verification code', { exact: false })).toBeVisible();
  await expect(page.getByText('orders found: 2', { exact: false })).toHaveCount(0);
  status = 'done'; finished = Date.now() / 1000 - 3600;
  await page.goto('/');
  await expect(page.getByText('Sync complete.', { exact: false })).toHaveCount(0);
  finished = Date.now() / 1000;
  await page.reload();
  await expect(page.getByText('Sync complete.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await page.reload();
  await expect(page.getByText('Sync complete.', { exact: false })).toHaveCount(0);
  user = 'B';
  await page.reload();
  await expect(page.getByText('Sync complete.', { exact: false })).toBeVisible();
  newerFailure = true;
  await page.reload();
  await expect(page.getByText('Sync complete.', { exact: false })).toHaveCount(0);
});
