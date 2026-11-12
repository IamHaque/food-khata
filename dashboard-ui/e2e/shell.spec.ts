import { test, expect, type Page } from '@playwright/test';
import { mockApi } from './mock-api';

const JOB = { id: 'j1', provider: 'SWIGGY', account_id: 'a', status: 'done', mode: 'incremental', created_at: 1, started_at: 1, finished_at: 2, counts: { orders: 1, details: 1 }, progress: {} };
const ACCOUNT = { id: 'a', local_id: 'a', provider: 'SWIGGY', phone: 'Customer A', status: 'ok' };

// [path, active nav item]
const ROUTES: [string, string][] = [
  ['/', 'Overview'], ['/spending', 'Spending'], ['/food', 'Food'], ['/habits', 'Habits'], ['/places', 'Places'],
  ['/orders', 'Orders'], ['/data-health', 'Data health'], ['/accounts', 'Accounts'], ['/accounts/link', 'Accounts'],
  ['/sync', 'Sync'], ['/jobs', 'Jobs'], ['/jobs/j1', 'Jobs'], ['/settings', 'Settings'],
];
const TABS = ['Overview', 'Spending', 'Food', 'Habits'];

async function setup(page: Page, accounts: unknown[] = [{ ...ACCOUNT, order_count: 1 }]) {
  await mockApi(page);
  await page.route('**/api/accounts', (r) => r.fulfill({ json: accounts }));
  await page.route('**/api/accounts/providers', (r) => r.fulfill({ json: { providers: ['SWIGGY', 'ZOMATO'] } }));
  await page.route('**/api/owner/status', (r) => r.fulfill({ json: { window: { is_open: false, until_closed: false }, registration: {} } }));
  await page.route('**/api/owner/audit', (r) => r.fulfill({ json: { rows: [] } }));
  await page.route('**/api/owner/users', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/sync/jobs/j1**', (r) => r.fulfill({ json: r.request().url().includes('/events') ? [] : JOB }));
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

for (const [width, height, label] of [[1280, 800, 'desktop'], [375, 800, 'mobile']] as const) {
  test.describe(label, () => {
    test.use({ viewport: { width, height } });

    for (const [path, active] of ROUTES) {
      test(`${path} loads inside the shell with "${active}" active`, async ({ page }) => {
        const errors = await setup(page);
        await page.goto(path);
        await expect(page.locator('header').getByRole('link', { name: 'Food Khata home' })).toBeVisible();
        if (width >= 768) {
          await expect(page.getByRole('navigation', { name: 'Main navigation' }).locator('[aria-current="page"]')).toHaveText(active);
        } else if (TABS.includes(active)) {
          await expect(page.getByRole('navigation', { name: 'Mobile tabs' }).locator('[aria-current="page"]')).toContainText(active);
        } else {
          await expect(page.getByRole('navigation', { name: 'Mobile tabs' }).getByRole('button', { name: 'More' })).toHaveAttribute('aria-current', 'page');
        }
        await page.waitForLoadState('networkidle');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        expect(errors).toEqual([]);
      });
    }

    test('filters and the review banner appear on analytics pages only', async ({ page }) => {
      await setup(page);
      await page.goto('/');
      await expect(page.getByRole('region', { name: /filters/i }).or(page.getByRole('button', { name: /date/i })).first()).toBeVisible();
      for (const p of ['/accounts', '/sync', '/jobs', '/settings', '/accounts/link']) {
        await page.goto(p);
        await expect(page.getByRole('button', { name: /date/i })).toHaveCount(0);
      }
    });

    test('with no linked account every destination shows an in-shell empty state', async ({ page }) => {
      const errors = await setup(page, []);
      for (const [path] of ROUTES.filter(([p]) => ['/', '/spending', '/food', '/habits', '/places', '/orders', '/data-health'].includes(p))) {
        await page.goto(path);
        await expect(page.getByRole('main').getByRole('link', { name: 'Link an account' })).toHaveCount(1);
        await expect(page.locator('header')).toBeVisible();
      }
      for (const path of ['/accounts', '/sync', '/jobs', '/settings']) {
        await page.goto(path);
        await expect(page.locator('header')).toBeVisible();
        await expect(page.getByRole('main')).not.toBeEmpty();
      }
      expect(errors).toEqual([]);
    });

    test('a linked account with zero orders offers Sync orders', async ({ page }) => {
      await setup(page, [{ ...ACCOUNT, order_count: 0 }]);
      await page.goto('/spending');
      await expect(page.getByRole('main').getByRole('link', { name: 'Sync orders' })).toHaveCount(1);
    });

    test('Overview in one action, any other destination in two', async ({ page }) => {
      await setup(page);
      await page.goto('/settings');
      await page.getByRole('link', { name: 'Food Khata home' }).click();
      await expect(page).toHaveURL(/\/$/);
      await page.goto('/jobs/j1');
      if (width >= 768) await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Orders' }).click();
      else {
        await page.getByRole('button', { name: 'More' }).click();
        await page.getByRole('navigation', { name: 'More destinations' }).getByRole('link', { name: 'Orders' }).click();
      }
      await expect(page).toHaveURL(/\/orders/);
    });

    test('/home aliases to /accounts', async ({ page }) => {
      await setup(page);
      await page.goto('/home');
      await expect(page).toHaveURL(/\/accounts$/);
    });

    test('deep pages show a back link', async ({ page }) => {
      await setup(page);
      await page.goto('/jobs/j1');
      await expect(page.getByRole('main').getByRole('link', { name: 'Jobs', exact: true })).toBeVisible();
      await page.goto('/accounts/link');
      await expect(page.getByRole('main').getByRole('link', { name: 'Accounts', exact: true })).toBeVisible();
    });
  });
}

test.describe('More sheet', () => {
  test.use({ viewport: { width: 375, height: 800 } });
  test('traps focus, closes on Escape and on selection', async ({ page }) => {
    await setup(page);
    await page.goto('/');
    const more = page.getByRole('navigation', { name: 'Mobile tabs' }).getByRole('button', { name: 'More' });
    await more.click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    for (const name of ['Places', 'Orders', 'Data health', 'Accounts', 'Sync', 'Jobs', 'Settings']) await expect(sheet.getByRole('link', { name })).toBeVisible();
    for (let i = 0; i < 15; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await more.click();
    await sheet.getByRole('link', { name: 'Settings' }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/settings/);
    await expect(more).toHaveAttribute('aria-current', 'page');
  });
});

test('a running job shows a header badge linking to it', async ({ page }) => {
  await setup(page);
  await page.route('**/api/sync/jobs', (r) => r.fulfill({ json: [{ ...JOB, status: 'running', finished_at: null }] }));
  await page.goto('/settings');
  await page.locator('header').getByRole('link', { name: /open sync job/i }).click();
  await expect(page).toHaveURL(/\/jobs\/j1/);
});

test('Accessible patterns keep the console clean on chart pages', async ({ page }) => {
  const errors = await setup(page);
  await page.addInitScript(() => localStorage.setItem('food-khata-patterns', 'on'));
  for (const p of ['/', '/spending', '/food', '/habits', '/places']) {
    await page.goto(p);
    await page.waitForLoadState('networkidle');
  }
  expect(errors).toEqual([]);
});
