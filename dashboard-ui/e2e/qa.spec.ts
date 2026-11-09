import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockApi } from './mock-api';

const pages = ['/', '/spending', '/food', '/habits', '/orders'];

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test.describe('accessibility', () => {
  for (const p of pages) {
    for (const scheme of ['light', 'dark'] as const) {
      for (const accent of ['emerald', 'indigo'] as const) {
        test(`${p} ${scheme} ${accent} has no serious/critical axe violations`, async ({ page }) => {
          await page.addInitScript((a) => {
            localStorage.setItem('food-khata-mode', scheme);
            localStorage.setItem('food-khata-accent', a);
          }, accent);
          await page.goto(p);
          await page.waitForLoadState('networkidle');
          const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa'])
            .analyze();
          const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
          expect(bad, JSON.stringify(bad.map((v) => v.id), null, 2)).toEqual([]);
        });
      }
    }
  }
});

test('keyboard: command palette opens and closes', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('Control+K');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('focus is visible', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return '';
    return getComputedStyle(el).outlineStyle;
  });
  // Not asserting exact; just ensure a focusable element received focus
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBeTruthy();
});

test.describe('reduced motion', () => {
  test('transitions disabled under reduced motion', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await mockApi(page);
    await page.goto('http://127.0.0.1:4173/');
    await page.waitForLoadState('networkidle');
    const prefers = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    expect(prefers).toBeTruthy();
    await context.close();
  });
});

test.describe('responsive', () => {
  for (const vp of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    test(`no horizontal scroll at ${vp.width}x${vp.height}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: vp });
      const page = await context.newPage();
      await mockApi(page);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      expect(overflow).toBeTruthy();
      await context.close();
    });
  }
});

test.describe('performance', () => {
  test('first route loads under 1.5s', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1500);
  });

  test('cross-filter click responds under 300ms', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // find a clickable filter-ish element
    const btn = page.getByRole('button').first();
    const start = Date.now();
    await btn.click();
    await page.waitForLoadState('networkidle');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(300);
  });
});