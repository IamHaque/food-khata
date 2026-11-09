import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module'; const require = createRequire(import.meta.url); const { chromium } = require('../../dashboard-ui/node_modules/@playwright/test');
const { preview } = require('../../dashboard-ui/node_modules/vite');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '../..');
const uiRoot = resolve(repoRoot, 'dashboard-ui');
const outputDir = resolve(__dirname, 'after');

mkdirSync(outputDir, { recursive: true });

const filters = {
  date_from: null, date_to: null, account_ids: [], platforms: [], statuses: ['DELIVERED'],
  cities: [], localities: [], restaurant_ids: [], cuisines: [], veg: 'all',
  payment_methods: [], amount_min: null, amount_max: null, meal_slots: [], day_type: 'all',
  verified_only: false, search: null, compare: 'none'
};

const accounts = [
  { id: 'fake-a', label: '0001', platforms: ['ZOMATO', 'SWIGGY'], order_count: 45, date_from: '2025-01-01', date_to: '2026-01-01' },
  { id: 'fake-b', label: '0002', platforms: ['SWIGGY'], order_count: 20, date_from: '2025-01-01', date_to: '2026-01-01' }
];

function makeOrders() { return Array.from({ length: 65 }, (_, i) => ({
  fees: 25, id: String(i), account_label: i < 45 ? 'Personal (0001)' : 'Work (0002)',
  account_id: i < 45 ? 'fake-a' : 'fake-b', platform_order_id: 'ORD-' + (1000 + i),
  order_timestamp: '2025-01-01T12:00:00', order_time: '12:00:00',
  payment_method: i % 3 === 0 ? 'UPI' : i % 3 === 1 ? 'CREDIT_CARD' : 'WALLET',
  user_rating: 4.5, food_discount: 50, delivery_fee_discount: 20, other_charges: 0,
  source_complete: true, reconciliation_difference: 0, platform: i % 2 === 0 ? 'SWIGGY' : 'ZOMATO',
  order_date: '2025-01-01', order_status: i === 1 ? 'CANCELLED' : 'DELIVERED',
  restaurant_name: i === 0 ? 'Spice Garden' : i === 1 ? 'Wok & Roll' : 'Restaurant ' + i,
  address_label: 'Home', city: 'Bengaluru', items_summary: 'Butter Chicken, Naan',
  final_amount_paid: 150 + i * 5, item_subtotal: 180 + i * 5, total_discount: 70,
  reported_savings: 70, delivery_fee: 30, packaging_fee: 15, platform_fee: 5, total_tax: 15,
  tip: 10, refund_amount: 0, financial_verified: i !== 1
})); }

const routes = [
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

const modes = ['light', 'dark'];
const accents = ['emerald', 'indigo'];

let server; let browser;
try {
  server = await preview({ root: uiRoot, preview: { host: '127.0.0.1', port: 0, open: false } });
  const baseUrl = server.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ reducedMotion: 'reduce' });

  await context.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.startsWith('/api/')) {
      const scope = u.searchParams.getAll('account_ids');
      const current = { ...filters, account_ids: scope };
      if (u.pathname === '/api/meta/filters') {
        return route.fulfill({ json: { filters_applied: current, generated_at: 'now', accounts: accounts.filter(a => !scope.length || scope.includes(a.id)), all_accounts: accounts, restaurants: [{id:'r-1',name:'Spice Garden'},{id:'r-2',name:'Wok & Roll'},{id:'r-3',name:'Biryani House'}], platforms:['SWIGGY','ZOMATO'], statuses:['DELIVERED','CANCELLED'], cities:['Bengaluru'], localities:['Koramangala','Indiranagar'], cuisines:['North Indian','Chinese','Biryani'], payment_methods:['UPI','CREDIT_CARD','WALLET'], date_from:'2024-01-01', date_to:'2025-01-01', amount_min:0, amount_max:2000 } });
      }
      if (u.pathname === '/api/meta/data-health') return route.fulfill({ json: { filters_applied: current, generated_at:'now', imports:[{account_id:'fake-a',platform:'SWIGGY',history_complete:true,details_complete:true}], history_complete:true, details_complete:true, verified_percent:98.4, null_rates:{delivery_fee:0.02}, duplicate_orders:0, reconciliation_anomalies:0, note:'synthetic' } });
      if (u.pathname === '/api/dashboard') {
        const body = route.request().postDataJSON() || {};
        const statuses = body.statuses ?? ['DELIVERED'];
        const rows = makeOrders().filter(o => (!body.account_ids?.length || body.account_ids.includes(o.account_id)) && (!statuses.length || statuses.includes(o.order_status)));
        const delivered = rows.filter(o => o.order_status === 'DELIVERED');
        const spend = delivered.reduce((n,o)=>n+o.final_amount_paid,0);
        return route.fulfill({ json: { filters_applied:{...filters,...body}, generated_at:'now', data_complete:true, comparison:null, kpis:{ orders:rows.length, valid_order_count:delivered.length, spend, aov: delivered.length?spend/delivered.length:null, total_discount:2400, reported_savings:2400, discount_rate:12.5, reported_savings_rate:12.5, fees:1650, fee_percentage:9.8, tax:850, tips:320, refunds:0, unique_restaurants:15, unique_dishes:28, average_rating:4.6 }, charts:{ food:{}, spending:{}, kpi_history:[], waterfall_steps:[], places:{}, behavior:{}, monthly:[], calendar:[], cost_waterfall:{}, top_restaurants:[], top_dishes:[], platforms:[], monthly_fee_components:[], insights:[] } } });
      }
      if (u.pathname.endsWith('/bill')) return route.fulfill({ json: { order: makeOrders()[0], items:[{item_name:'Butter Chicken',quantity:1,unit_price:250,total_price:250,is_veg:false,category:'Main'}], discount_items:[{label:'Flat 50 off',amount:50}], reconciliation_status:'matches', reconciliation_label:'Matches', reconciliation_difference:0, full_address:'x', source_bill:{item_total:100}, discount_breakdown:null } });
      if (u.pathname === '/api/restaurants' || u.pathname === '/api/items') return route.fulfill({ json: { filters_applied: current, generated_at:'now', rows:[], total:0, page:1, page_size:25 } });
      if (u.pathname === '/api/orders') {
        const all = makeOrders(); const statuses = u.searchParams.getAll('statuses').filter(Boolean);
        const filtered = all.filter(o => (!scope.length || scope.includes(o.account_id)) && (!statuses.length || statuses.includes(o.order_status)));
        return route.fulfill({ json: { filters_applied:{...current,statuses}, generated_at:'now', rows:filtered, total:filtered.length, page:1, page_size:50, filtered_total_amount:filtered.reduce((n,o)=>n+o.final_amount_paid,0) } });
      }
      if (u.pathname === '/api/orders/slim') return route.fulfill({ json: { filters_applied:current, generated_at:'now', rows: makeOrders().map(o=>({id:o.id,order_date:o.order_date,platform:o.platform,order_status:o.order_status,final_amount_paid:o.final_amount_paid})) } });
      return route.abort();
    }
    if (u.origin === new URL(baseUrl).origin) return route.continue();
    return route.abort();
  });

  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  for (const route of routes) {
    for (const mode of modes) {
      for (const accent of accents) {
        for (const vp of viewports) {
          const filename = `${route.slug}-${vp.name}-${mode}-${accent}.png`;
          const targetPath = resolve(outputDir, filename);
          console.log('Capturing', filename);
          try {
            await page.addInitScript(({m,a}) => { localStorage.setItem('food-khata-mode', m); localStorage.setItem('food-khata-accent', a); }, { m: mode, a: accent });
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await page.goto(new URL(route.path, baseUrl).href);
            if (mode === 'dark') {
              await page.evaluate(() => { document.documentElement.classList.add('dark'); });
            } else {
              await page.evaluate(() => { document.documentElement.classList.remove('dark'); });
            }
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(500);
            await page.screenshot({ path: targetPath, fullPage: false });
          } catch (err) {
            console.error('Failed', filename, err.message);
          }
        }
      }
    }
  }
} finally {
  if (browser) await browser.close();
  if (server?.httpServer) await new Promise((resolve) => server.httpServer.close(resolve));
}

