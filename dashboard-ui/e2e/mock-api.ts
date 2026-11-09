import type { Page } from '@playwright/test';

export const FILTERS = {
  anomaly: 'all',
  veg: 'all',
  day_type: 'all',
  verified_only: false,
  compare: 'none',
};

export async function mockApi(page: Page) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === '/api/meta/filters') {
      return route.fulfill({
        json: {
          filters_applied: FILTERS,
          generated_at: '2026-01-01T00:00:00Z',
          accounts: [{ id: 'a', label: 'Customer A', platforms: ['SWIGGY'], order_count: 1, date_from: '2026-01-01', date_to: '2026-01-01' }],
          all_accounts: [{ id: 'a', label: 'Customer A', platforms: ['SWIGGY'], order_count: 1, date_from: '2026-01-01', date_to: '2026-01-01' }],
          restaurants: [{ id: 'r0', name: 'Restaurant 0' }],
          platforms: ['SWIGGY'],
          statuses: ['DELIVERED'],
          cities: ['City'],
          localities: ['Loc'],
          cuisines: ['Meals'],
          payment_methods: ['UPI'],
          date_from: '2026-01-01',
          date_to: '2026-01-01',
          amount_min: 100,
          amount_max: 200,
        },
      });
    }
    if (path === '/api/meta/data-health') {
      return route.fulfill({
        json: {
          filters_applied: FILTERS,
          generated_at: '2026-01-01T00:00:00Z',
          imports: [{ account_id: 'a', platform: 'SWIGGY', history_complete: true, details_complete: true }],
          history_complete: true,
          details_complete: true,
          verified_percent: 100,
          null_rates: {},
          duplicate_orders: 0,
          reconciliation_anomalies: 0,
          note: 'ok',
        },
      });
    }
    if (path === '/api/dashboard') {
      return route.fulfill({
        json: {
          filters_applied: FILTERS,
          generated_at: '2026-01-01T00:00:00Z',
          kpis: {
            orders: 1, valid_order_count: 1, spend: 100, aov: 100, total_discount: 0, reported_savings: 0,
            discount_rate: 0, reported_savings_rate: 0, fees: 0, fee_percentage: 0, tax: 0, tips: 0, refunds: 0,
            unique_restaurants: 1, unique_dishes: 1, average_rating: 5,
          },
          data_complete: true,
          comparison: null,
          charts: {
            kpi_history: [],
            waterfall_steps: [],
            food: { diet_monthly: [], cuisines: [], diet: [], loyalty: [], new_repeat: [], cuisine_unavailable_reason: null, diet_unavailable_reason: null, orders_without_dates: 0 },
            spending: { discount_breakdown: [], daily: [], years: [], fee_scatter: [], unallocated_spend: 0 },
            places: { labels: [], distances: [], distance_unavailable_reason: null, unsupported_reason: null },
            behavior: { timing_unavailable_reason: null, date_unavailable_reason: null, hour_weekday: [], meals: [], day_type: [], aov_histogram: [], gaps: [], longest_streak: null, longest_gap: null, orders_per_week: null },
            monthly: [],
            calendar: [],
            cost_waterfall: { subtotal: 100, food_discount: 0, net_delivery: 0, packaging: 0, platform: 0, tax: 0, tip: 0, other: 0, residual: 0, provider_paid: 100, refunds: 0 },
            top_restaurants: [],
            top_dishes: [],
            platforms: [],
            monthly_fee_components: [],
            insights: [],
          },
        },
      });
    }
    if (path === '/api/orders') {
      return route.fulfill({
        json: {
          filters_applied: FILTERS,
          generated_at: '2026-01-01T00:00:00Z',
          rows: [{
            fees: 0, id: '1', account_label: 'Customer A', account_id: 'a', platform_order_id: 'order-1',
            order_timestamp: '2026-01-01T12:00:00+05:30', order_time: '12:00:00', payment_method: 'UPI',
            user_rating: 5, food_discount: 0, delivery_fee_discount: 0, other_charges: 0, source_complete: true,
            reconciliation_difference: 0, platform: 'SWIGGY', order_date: '2026-01-01', order_status: 'DELIVERED',
            restaurant_name: 'Restaurant 0', address_label: 'Central', city: 'City', items_summary: 'Lunch',
            final_amount_paid: 100, item_subtotal: 100, total_discount: 0, reported_savings: 0, delivery_fee: 0,
            packaging_fee: 0, platform_fee: 0, total_tax: 0, tip: 0, refund_amount: 0, financial_verified: true,
          }],
          total: 1,
          page: 1,
          page_size: 20,
          filtered_total_amount: 100,
        },
      });
    }
    if (path.startsWith('/api/orders/') && path.endsWith('/bill')) {
      return route.fulfill({
        json: {
          discount_items: [],
          reconciliation_label: 'matches',
          reconciliation_status: 'matches',
          order: {
            fees: 0, id: '1', account_label: 'Customer A', account_id: 'a', platform_order_id: 'order-1',
            order_timestamp: '2026-01-01T12:00:00+05:30', order_time: '12:00:00', payment_method: 'UPI',
            user_rating: 5, food_discount: 0, delivery_fee_discount: 0, other_charges: 0, source_complete: true,
            reconciliation_difference: 0, platform: 'SWIGGY', order_date: '2026-01-01', order_status: 'DELIVERED',
            restaurant_name: 'Restaurant 0', address_label: 'Central', city: 'City', items_summary: 'Lunch',
            final_amount_paid: 100, item_subtotal: 100, total_discount: 0, reported_savings: 0, delivery_fee: 0,
            packaging_fee: 0, platform_fee: 0, total_tax: 0, tip: 0, refund_amount: 0, financial_verified: true,
          },
          items: [{ item_name: 'Lunch', quantity: 1, unit_price: 100, total_price: 100, is_veg: true, category: 'Meals' }],
          reconciliation_difference: 0,
          full_address: 'Example address',
        },
      });
    }
    if (path === '/api/restaurants' || path === '/api/items') {
      return route.fulfill({
        json: {
          filters_applied: FILTERS,
          generated_at: '2026-01-01T00:00:00Z',
          rows: [],
          total: 0,
          page: 1,
          page_size: 20,
        },
      });
    }
    if (path === '/api/orders/slim') {
      return route.fulfill({
        json: {
          filters_applied: FILTERS,
          generated_at: '2026-01-01T00:00:00Z',
          rows: [{ id: '1', order_date: '2026-01-01', platform: 'SWIGGY', order_status: 'DELIVERED', final_amount_paid: 100 }],
        },
      });
    }
    return route.fulfill({ json: {} });
  });
}