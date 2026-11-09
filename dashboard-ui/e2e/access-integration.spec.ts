import { test, expect } from '@playwright/test';
import { mockApi } from './mock-api';
for (const width of [1440, 390]) {
  test(`access integration ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page);
    let user = 'A', status = 'running', orders = 0;
    let hold = false, release!: () => void, pending!: () => void;
    const waiting = new Promise<void>(resolve => { pending = resolve; });
    const delayed = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/**', async (route, request) => {
      const path = new URL(request.url()).pathname;
      if (path === '/api/auth/me') return user ? route.fulfill({ json: { id: user, username: user, is_owner: false, created_at: '' } }) : route.fulfill({ status: 401 });
      if (path === '/api/auth/csrf') return route.fulfill({ json: { csrf_token: 'fake' } });
      if (path === '/api/auth/login') { user = 'B'; return route.fulfill({ json: { user: { id: user }, csrf_token: 'fake' } }); }
      if (path === '/api/auth/logout') { user = ''; return route.fulfill({ json: {} }); }
      if (path === '/api/accounts') { const captured = user; if (hold && captured === 'A') { pending(); await delayed; } return route.fulfill({ json: [{ id: captured, local_id: captured, provider: 'fake', phone: `Account ${captured}`, status: 'ok', order_count: orders }] }).catch(() => {}); }
      if (path === '/api/sync/jobs') return route.fulfill({ json: [{ id: 'job 1', user_id: user, account_id: user, provider: 'fake', mode: 'new', status, partial_decision: 'pending', finished_at: 100 }] });
      return route.fallback();
    });
    await page.goto('/');
    await expect(page.getByText('Fetching your first orders.', { exact: false })).toBeVisible();
    await expect(page.getByText('Account: Account A', { exact: false })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/access-${width}.png` });
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
    orders = 2;
    await page.reload();
    await expect(page.getByText('Syncing orders in the background.', { exact: false })).toBeVisible();
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
