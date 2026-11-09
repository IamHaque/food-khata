import { test, expect } from '@playwright/test';
import { mockApi } from '../mock-api';

const routes: { slug: string; path: string }[] = [
  { slug: 'overview', path: '/' },
  { slug: 'spending', path: '/spending' },
  { slug: 'food', path: '/food' },
  { slug: 'habits', path: '/habits' },
  { slug: 'orders', path: '/orders' },
];

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

const modes = ['light', 'dark'] as const;
const accents = ['emerald', 'indigo'] as const;

for (const vp of viewports) {
  for (const route of routes) {
    for (const mode of modes) {
      for (const accent of accents) {
        test.describe(`${route.slug} ${vp.name} ${mode} ${accent}`, () => {
          test.use({ viewport: { width: vp.width, height: vp.height } });

          test('visual', async ({ page }) => {
            await mockApi(page);
            await page.addInitScript(
              ({ m, a }) => {
                localStorage.setItem('food-khata-mode', m);
                localStorage.setItem('food-khata-accent', a);
              },
              { m: mode, a: accent },
            );
            await page.goto(route.path);
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(1000);
            await expect(page).toHaveScreenshot(
              `${route.slug}-${vp.name}-${mode}-${accent}.png`,
              { animations: 'disabled', maxDiffPixelRatio: 0.02 },
            );
          });
        });
      }
    }
  }
}
