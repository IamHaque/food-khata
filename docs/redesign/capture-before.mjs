import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '../..');
const uiRoot = resolve(repoRoot, 'dashboard-ui');
const outputDir = resolve(__dirname, 'before');

mkdirSync(outputDir, { recursive: true });

const filters = {
  date_from: null,
  date_to: null,
  account_ids: [],
  platforms: [],
  statuses: ['DELIVERED'],
  cities: [],
  localities: [],
  restaurant_ids: [],
  cuisines: [],
  veg: 'all',
  payment_methods: [],
  amount_min: null,
  amount_max: null,
  meal_slots: [],
  day_type: 'all',
  verified_only: false,
  search: null,
  compare: 'none'
};

const accounts = [
  { id: 'fake-a', label: '••••0001', platforms: ['ZOMATO', 'SWIGGY'], order_count: 45, date_from: '2025-01-01', date_to: '2026-01-01' },
  { id: 'fake-b', label: '••••0002', platforms: ['SWIGGY'], order_count: 20, date_from: '2025-01-01', date_to: '2026-01-01' }
];

function makeOrders() {
  return Array.from({ length: 65 }, (_, i) => ({
    fees: 25,
    id: String(i),
    account_label: i < 45 ? 'Personal (••••0001)' : 'Work (••••0002)',
    account_id: i < 45 ? 'fake-a' : 'fake-b',
    platform_order_id: 'ORD-' + (1000 + i),
    order_timestamp: '2025-01-01T12:00:00',
    order_time: '12:00:00',
    payment_method: i % 3 === 0 ? 'UPI' : i % 3 === 1 ? 'CREDIT_CARD' : 'WALLET',
    user_rating: 4.5,
    food_discount: 50,
    delivery_fee_discount: 20,
    other_charges: 0,
    source_complete: true,
    reconciliation_difference: 0,
    platform: i % 2 === 0 ? 'SWIGGY' : 'ZOMATO',
    order_date: '2025-01-01',
    order_status: i === 1 ? 'CANCELLED' : 'DELIVERED',
    restaurant_name: i === 0 ? 'Spice Garden' : i === 1 ? 'Wok & Roll' : 'Restaurant ' + i,
    address_label: 'Home',
    city: 'Bengaluru',
    items_summary: 'Butter Chicken, Naan',
    final_amount_paid: 150 + i * 5,
    item_subtotal: 180 + i * 5,
    total_discount: 70,
    reported_savings: 70,
    delivery_fee: 30,
    packaging_fee: 15,
    platform_fee: 5,
    total_tax: 15,
    tip: 10,
    refund_amount: 0,
    financial_verified: i !== 1
  }));
}

const routes = [
  { slug: 'overview', path: '/' },
  { slug: 'spending', path: '/spending' },
  { slug: 'food', path: '/food' },
  { slug: 'behavior', path: '/behavior' },
  { slug: 'places', path: '/places' },
  { slug: 'ledger', path: '/ledger' },
  { slug: 'data-health', path: '/data-health' },
];

const viewports = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '390x844', width: 390, height: 844 },
];

const modes = ['light', 'dark'];

let server;
let browser;

try {
  console.log('Starting Vite preview server from', uiRoot);
  server = await preview({
    root: uiRoot,
    preview: { host: '127.0.0.1', port: 0, open: false }
  });
  const baseUrl = server.resolvedUrls.local[0];
  console.log('Preview server running at', baseUrl);

  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {})
  });

  const context = await browser.newContext({
    reducedMotion: 'reduce'
  });

  // Mock API routes
  await context.route('**/*', async (route) => {
    const u = new URL(route.request().url());

    if (u.pathname.startsWith('/api/')) {
      const scope = u.searchParams.getAll('account_ids');
      const current = { ...filters, account_ids: scope };

      if (u.pathname === '/api/meta/filters') {
        return route.fulfill({
          json: {
            filters_applied: current,
            generated_at: 'now',
            accounts: accounts.filter(a => !scope.length || scope.includes(a.id)),
            all_accounts: accounts,
            restaurants: [
              { id: 'r-1', name: 'Spice Garden' },
              { id: 'r-2', name: 'Wok & Roll' },
              { id: 'r-3', name: 'Biryani House' }
            ],
            platforms: ['SWIGGY', 'ZOMATO'],
            statuses: ['DELIVERED', 'CANCELLED'],
            cities: ['Bengaluru'],
            localities: ['Koramangala', 'Indiranagar'],
            cuisines: ['North Indian', 'Chinese', 'Biryani'],
            payment_methods: ['UPI', 'CREDIT_CARD', 'WALLET'],
            date_from: '2024-01-01',
            date_to: '2025-01-01',
            amount_min: 0,
            amount_max: 2000
          }
        });
      }

      if (u.pathname === '/api/meta/data-health') {
        return route.fulfill({
          json: {
            filters_applied: current,
            generated_at: 'now',
            imports: [
              { account_id: 'fake-a', platform: 'SWIGGY', history_complete: true, details_complete: true },
              { account_id: 'fake-a', platform: 'ZOMATO', history_complete: true, details_complete: true },
              { account_id: 'fake-b', platform: 'SWIGGY', history_complete: true, details_complete: true }
            ],
            history_complete: true,
            details_complete: true,
            verified_percent: 98.4,
            null_rates: { delivery_fee: 0.02, packaging_fee: 0.01, tip: 0.05 },
            duplicate_orders: 0,
            reconciliation_anomalies: 0,
            note: 'Synthetic data for baseline verification'
          }
        });
      }

      if (u.pathname === '/api/dashboard') {
        const body = route.request().postDataJSON() || {};
        const statuses = body.statuses ?? ['DELIVERED'];
        const rows = makeOrders().filter(o => (!body.account_ids?.length || body.account_ids.includes(o.account_id)) && (!statuses.length || statuses.includes(o.order_status)));
        const delivered = rows.filter(o => o.order_status === 'DELIVERED');
        const spend = delivered.reduce((n, o) => n + o.final_amount_paid, 0);

        return route.fulfill({
          json: {
            filters_applied: { ...filters, ...body },
            generated_at: 'now',
            data_complete: true,
            comparison: null,
            kpis: {
              orders: rows.length,
              valid_order_count: delivered.length,
              spend,
              aov: delivered.length ? spend / delivered.length : null,
              total_discount: 2400,
              reported_savings: 2400,
              discount_rate: 12.5,
              reported_savings_rate: 12.5,
              fees: 1650,
              fee_percentage: 9.8,
              tax: 850,
              tips: 320,
              refunds: 0,
              unique_restaurants: 15,
              unique_dishes: 28,
              average_rating: 4.6
            },
            charts: {
              food: {
                diet_monthly: [
                  { month: '2024-11', veg: 10, non_veg: 6, unknown: 2 },
                  { month: '2024-12', veg: 12, non_veg: 8, unknown: 2 },
                  { month: '2025-01', veg: 15, non_veg: 8, unknown: 2 }
                ],
                cuisines: [
                  { name: 'North Indian', orders: 25, spend: 8500 },
                  { name: 'Chinese', orders: 15, spend: 4200 },
                  { name: 'Biryani', orders: 12, spend: 3600 },
                  { name: 'South Indian', orders: 8, spend: 1800 },
                  { name: 'Desserts', orders: 5, spend: 900 }
                ],
                diet: [
                  { diet: 'Veg', item_lines: 35, quantity: 40, line_total: 9500 },
                  { diet: 'Non-Veg', item_lines: 25, quantity: 30, line_total: 8500 },
                  { diet: 'Unknown', item_lines: 5, quantity: 5, line_total: 1000 }
                ],
                loyalty: [
                  { key: 'r-1', name: 'Spice Garden', orders: 18, spend: 6200, aov: 344.4 },
                  { key: 'r-2', name: 'Wok & Roll', orders: 12, spend: 3800, aov: 316.6 },
                  { key: 'r-3', name: 'Biryani House', orders: 10, spend: 3200, aov: 320.0 }
                ],
                new_repeat: [
                  { month: '2024-11', new_orders: 8, repeat_orders: 10 },
                  { month: '2024-12', new_orders: 5, repeat_orders: 17 },
                  { month: '2025-01', new_orders: 4, repeat_orders: 21 }
                ],
                cuisine_unavailable_reason: null,
                diet_unavailable_reason: null,
                orders_without_dates: 0
              },
              spending: {
                discount_breakdown: [
                  { label: 'Food discount', amount: 1600 },
                  { label: 'Delivery fee discount', amount: 500 },
                  { label: 'Payment coupon', amount: 300 }
                ],
                daily: [
                  { date: '2025-01-01', spend: 450, cumulative: 450, rolling_30: 450 },
                  { date: '2025-01-02', spend: 620, cumulative: 1070, rolling_30: 535 },
                  { date: '2025-01-03', spend: 380, cumulative: 1450, rolling_30: 483 },
                  { date: '2025-01-04', spend: 890, cumulative: 2340, rolling_30: 585 },
                  { date: '2025-01-05', spend: 510, cumulative: 2850, rolling_30: 570 }
                ],
                years: [
                  { year: 2024, month: 11, spend: 4200 },
                  { year: 2024, month: 12, spend: 5100 },
                  { year: 2025, month: 1, spend: 6300 }
                ],
                fee_scatter: [
                  { amount: 350, fees: 45, fee_percent: 12.8 },
                  { amount: 520, fees: 60, fee_percent: 11.5 },
                  { amount: 890, fees: 95, fee_percent: 10.6 }
                ],
                unallocated_spend: 0
              },
              kpi_history: [
                { month: '2024-11', orders: 18, valid_order_count: 18, spend: 5400, aov: 300, total_discount: 600, reported_savings: 600, discount_rate: 10, reported_savings_rate: 10, fees: 540, fee_percentage: 10, tax: 270, tips: 90, refunds: 0, unique_restaurants: 8, unique_dishes: 15, average_rating: 4.5 },
                { month: '2024-12', orders: 22, valid_order_count: 22, spend: 6600, aov: 300, total_discount: 800, reported_savings: 800, discount_rate: 10.8, reported_savings_rate: 10.8, fees: 660, fee_percentage: 10, tax: 330, tips: 110, refunds: 0, unique_restaurants: 10, unique_dishes: 18, average_rating: 4.6 },
                { month: '2025-01', orders: 25, valid_order_count: 25, spend: 7000, aov: 280, total_discount: 900, reported_savings: 900, discount_rate: 11.3, reported_savings_rate: 11.3, fees: 700, fee_percentage: 10, tax: 350, tips: 120, refunds: 0, unique_restaurants: 12, unique_dishes: 22, average_rating: 4.7 }
              ],
              waterfall_steps: [
                { label: 'Items subtotal', amount: 18000, baseline: 0, height: 18000, direction: 'up' },
                { label: 'Discounts', amount: -3700, baseline: 18000, height: 3700, direction: 'down' },
                { label: 'Taxes & fees', amount: 1900, baseline: 14300, height: 1900, direction: 'up' },
                { label: 'Tips', amount: 320, baseline: 16200, height: 320, direction: 'up' },
                { label: 'Paid', amount: 16520, baseline: 0, height: 16520, direction: 'total' }
              ],
              places: {
                labels: [
                  { label: 'Home', city: 'Bengaluru', orders: 38, spend: 11200, fee: 1100 },
                  { label: 'Work', city: 'Bengaluru', orders: 22, spend: 6800, fee: 720 },
                  { label: 'Other', city: 'Bengaluru', orders: 5, spend: 1000, fee: 180 }
                ],
                distances: [
                  { distance_km: 1.5, fee: 25 },
                  { distance_km: 3.2, fee: 40 },
                  { distance_km: 5.8, fee: 65 },
                  { distance_km: 8.1, fee: 90 }
                ],
                distance_unavailable_reason: null,
                unsupported_reason: null
              },
              behavior: {
                timing_unavailable_reason: null,
                date_unavailable_reason: null,
                hour_weekday: [
                  { key: '12', orders: 18, spend: 5400 },
                  { key: '13', orders: 22, spend: 6600 },
                  { key: '20', orders: 15, spend: 4800 },
                  { key: '21', orders: 10, spend: 2200 }
                ],
                meals: [
                  { key: 'breakfast', orders: 8, spend: 1600 },
                  { key: 'lunch', orders: 32, spend: 9800 },
                  { key: 'snack', orders: 10, spend: 2100 },
                  { key: 'dinner', orders: 15, spend: 5500 }
                ],
                day_type: [
                  { key: 'weekday', orders: 45, spend: 13500 },
                  { key: 'weekend', orders: 20, spend: 5500 }
                ],
                aov_histogram: [
                  { key: '100-250', orders: 20 },
                  { key: '250-500', orders: 30 },
                  { key: '500-1000', orders: 12 },
                  { key: '1000+', orders: 3 }
                ],
                gaps: [
                  { days: 1, orders: 25 },
                  { days: 2, orders: 15 },
                  { days: 3, orders: 8 },
                  { days: 5, orders: 4 }
                ],
                longest_streak: 5,
                longest_gap: 4,
                orders_per_week: 7.2
              },
              monthly: [
                { month: '2024-11', orders: 18, spend: 5400 },
                { month: '2024-12', orders: 22, spend: 6600 },
                { month: '2025-01', orders: 25, spend: 7000 }
              ],
              calendar: [
                { date: '2025-01-01', orders: 2, spend: 650 },
                { date: '2025-01-02', orders: 1, spend: 320 },
                { date: '2025-01-03', orders: 3, spend: 940 },
                { date: '2025-01-04', orders: 2, spend: 580 },
                { date: '2025-01-05', orders: 1, spend: 250 }
              ],
              cost_waterfall: {
                subtotal: 18000,
                food_discount: 2400,
                net_delivery: 650,
                packaging: 350,
                platform: 400,
                tax: 500,
                tip: 320,
                other: 0,
                residual: 0,
                provider_paid: 16520,
                refunds: 0
              },
              top_restaurants: [
                { key: 'r-1', name: 'Spice Garden', quantity: 25, amount: 6200 },
                { key: 'r-2', name: 'Wok & Roll', quantity: 18, amount: 3800 },
                { key: 'r-3', name: 'Biryani House', quantity: 14, amount: 3200 }
              ],
              top_dishes: [
                { key: 'd-1', name: 'Butter Chicken', quantity: 15, amount: 4200 },
                { key: 'd-2', name: 'Paneer Tikka', quantity: 12, amount: 2800 },
                { key: 'd-3', name: 'Chicken Biryani', quantity: 10, amount: 2500 }
              ],
              platforms: [
                { platform: 'SWIGGY', orders: 40, spend: 11500, discounts: 2200, advertised_savings: 2200, fees: 1200 },
                { platform: 'ZOMATO', orders: 25, spend: 7500, discounts: 1500, advertised_savings: 1500, fees: 700 }
              ],
              monthly_fee_components: [
                { month: '2024-11', order_count: 18, net_delivery: 180, packaging: 90, platform: 110, tax: 140, total_fees: 520, rounding_adjustment: 0 },
                { month: '2024-12', order_count: 22, net_delivery: 220, packaging: 110, platform: 130, tax: 170, total_fees: 630, rounding_adjustment: 0 },
                { month: '2025-01', order_count: 25, net_delivery: 250, packaging: 125, platform: 150, tax: 190, total_fees: 715, rounding_adjustment: 0 }
              ],
              insights: [
                { key: 'most_frequent_platform', text: 'Most frequent platform: Swiggy (61.5% of orders)', value: 'Swiggy', filter_patch: { platforms: ['SWIGGY'], restaurant_ids: [] } },
                { key: 'top_restaurant', text: 'Top restaurant: Spice Garden (₹6,200 spent)', value: 'Spice Garden', filter_patch: { platforms: [], restaurant_ids: ['r-1'] } },
                { key: 'fee_percentage', text: 'Fees account for 9.8% of total order cost', value: '9.8%', filter_patch: { platforms: [], restaurant_ids: [] } }
              ]
            }
          }
        });
      }

      if (u.pathname.endsWith('/bill')) {
        const id = decodeURIComponent(u.pathname.split('/')[3]);
        const order = makeOrders().find(row => row.id === id) || makeOrders()[0];
        return route.fulfill({
          json: {
            order,
            items: [
              { item_name: 'Butter Chicken', quantity: 1, unit_price: 250, total_price: 250, is_veg: false, category: 'Main Course' },
              { item_name: 'Garlic Naan', quantity: 2, unit_price: 45, total_price: 90, is_veg: true, category: 'Breads' }
            ],
            discount_items: [{ label: 'Flat ₹50 off', amount: 50 }],
            reconciliation_status: 'matches',
            reconciliation_label: 'Matches',
            reconciliation_difference: 0,
            full_address: '123, 4th Cross, Koramangala, Bengaluru',
            source_bill: { item_total: order.final_amount_paid },
            discount_breakdown: null
          }
        });
      }

      if (u.pathname === '/api/restaurants' || u.pathname === '/api/items') {
        const isRest = u.pathname === '/api/restaurants';
        return route.fulfill({
          json: {
            filters_applied: current,
            generated_at: 'now',
            rows: isRest
              ? [
                  { key: 'r-1', name: 'Spice Garden', quantity: 25, amount: 6200, price_trend: [{ month: '2025-01', unit_price: 248, quantity: 25 }] },
                  { key: 'r-2', name: 'Wok & Roll', quantity: 18, amount: 3800, price_trend: [{ month: '2025-01', unit_price: 211, quantity: 18 }] },
                  { key: 'r-3', name: 'Biryani House', quantity: 14, amount: 3200, price_trend: [{ month: '2025-01', unit_price: 228, quantity: 14 }] }
                ]
              : [
                  { key: 'd-1', name: 'Butter Chicken', quantity: 15, amount: 4200, price_trend: [{ month: '2025-01', unit_price: 280, quantity: 15 }] },
                  { key: 'd-2', name: 'Paneer Tikka', quantity: 12, amount: 2800, price_trend: [{ month: '2025-01', unit_price: 233, quantity: 12 }] },
                  { key: 'd-3', name: 'Chicken Biryani', quantity: 10, amount: 2500, price_trend: [{ month: '2025-01', unit_price: 250, quantity: 10 }] }
                ],
            total: 3,
            page: 1,
            page_size: 25
          }
        });
      }

      if (u.pathname === '/api/orders') {
        const all = makeOrders();
        const statuses = u.searchParams.getAll('statuses').filter(Boolean);
        const filtered = all.filter(o => (!scope.length || scope.includes(o.account_id)) && (!statuses.length || statuses.includes(o.order_status)));
        const pageNumber = Number(u.searchParams.get('page') ?? 1);
        const size = Number(u.searchParams.get('page_size') ?? 50);
        return route.fulfill({
          json: {
            filters_applied: { ...current, statuses },
            generated_at: 'now',
            rows: filtered.slice((pageNumber - 1) * size, pageNumber * size),
            total: filtered.length,
            page: pageNumber,
            page_size: size,
            filtered_total_amount: filtered.reduce((n, o) => n + o.final_amount_paid, 0)
          }
        });
      }

      if (u.pathname === '/api/orders/slim') {
        return route.fulfill({
          json: {
            filters_applied: current,
            generated_at: 'now',
            rows: makeOrders().map(o => ({
              id: o.id,
              order_date: o.order_date,
              platform: o.platform,
              order_status: o.order_status,
              final_amount_paid: o.final_amount_paid
            }))
          }
        });
      }

      return route.abort();
    }

    if (u.origin === new URL(baseUrl).origin) {
      return route.continue();
    }
    return route.abort();
  });

  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  const results = [];

  for (const route of routes) {
    for (const mode of modes) {
      for (const vp of viewports) {
        const targetFilename = `${route.slug}-${mode}-${vp.name}.png`;
        const targetPath = resolve(outputDir, targetFilename);

        console.log(`Capturing: ${route.slug} (${mode}, ${vp.name}) -> ${targetFilename}`);

        try {
          await page.setViewportSize({ width: vp.width, height: vp.height });
          const targetUrl = new URL(route.path, baseUrl).href;
          await page.goto(targetUrl);

          // Apply theme mode
          if (mode === 'dark') {
            await page.evaluate(() => {
              document.documentElement.classList.add('dark');
              document.documentElement.dataset.v2theme = 'dark';
              try { localStorage.setItem('food-khata-v2-theme', 'dark'); } catch {}
            });
          } else {
            await page.evaluate(() => {
              document.documentElement.classList.remove('dark');
              document.documentElement.dataset.v2theme = 'light';
              try { localStorage.setItem('food-khata-v2-theme', 'light'); } catch {}
            });
          }

          await page.waitForLoadState('networkidle');
          // Wait briefly for CSS transitions and canvas/charts rendering
          await page.waitForTimeout(400);

          await page.screenshot({
            path: targetPath,
            fullPage: false
          });

          results.push({
            route: route.slug,
            path: route.path,
            mode,
            resolution: vp.name,
            file: targetFilename,
            status: 'success'
          });
        } catch (err) {
          console.error(`Failed to capture ${targetFilename}:`, err);
          results.push({
            route: route.slug,
            path: route.path,
            mode,
            resolution: vp.name,
            file: targetFilename,
            status: 'failed',
            error: err.message
          });
        }
      }
    }
  }

  const successCount = results.filter(r => r.status === 'success').length;
  const failCount = results.filter(r => r.status === 'failed').length;
  console.log(`Capture complete: ${successCount} succeeded, ${failCount} failed.`);

  if (failCount > 0) {
    process.exitCode = 1;
  }
} finally {
  if (browser) await browser.close();
  if (server?.httpServer) {
    await new Promise((resolve) => server.httpServer.close(resolve));
  }
}
