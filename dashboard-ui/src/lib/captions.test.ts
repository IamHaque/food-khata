import { describe, expect, it } from 'vitest';
import {
 computeBillWaterfallTakeaway,
 computeCumulativeSpendTakeaway,
 computeDailySpendTakeaway,
 computeDayTypeTakeaway,
 computeFeeComponentsTakeaway,
 computeFeeScatterTakeaway,
 computeHourWeekdayTakeaway,
 computeMealSlotTakeaway,
 computeMealSlotsTakeaway,
 computeOrderValueDistributionTakeaway,
 computePlatformTakeaway,
 computeSpendTrendTakeaway,
 computeTopRestaurantTakeaway,
 computeWeekdayTakeaway,
 computeOrderGapsTakeaway,
 computeWeightedMedianGap,
 computeDestinationsTakeaway,
 computeDistanceVsFeeTakeaway,
 formatRupees,
} from './captions';

describe('computeMealSlotTakeaway', () => {
 it('states the share of orders for the busiest meal slot', () => {
  expect(computeMealSlotTakeaway([
   { slot: 'breakfast', count: 15 },
   { slot: 'lunch', count: 30 },
   { slot: 'snack', count: 7 },
   { slot: 'dinner', count: 48 },
  ])).toBe('Dinner accounts for 48% of orders');
 });

 it('rounds percentages to whole numbers', () => {
  expect(computeMealSlotTakeaway([
   { slot: 'dinner', count: 2 },
   { slot: 'lunch', count: 1 },
  ])).toBe('Dinner accounts for 67% of orders');
 });

 it('aggregates duplicate slots case-insensitively and humanizes snake_case', () => {
  expect(computeMealSlotTakeaway([
   { slot: 'dinner', count: 10 },
   { slot: 'Dinner', count: 14 },
   { slot: 'lunch', count: 16 },
  ])).toBe('Dinner accounts for 60% of orders');
  expect(computeMealSlotTakeaway([
   { slot: 'late_night', count: 6 },
   { slot: 'lunch', count: 4 },
  ])).toBe('Late night accounts for 60% of orders');
 });

 it('returns null for missing, empty, zero, invalid and tied data', () => {
  expect(computeMealSlotTakeaway(null)).toBeNull();
  expect(computeMealSlotTakeaway(undefined)).toBeNull();
  expect(computeMealSlotTakeaway([])).toBeNull();
  expect(computeMealSlotTakeaway([{ slot: 'dinner', count: 0 }])).toBeNull();
  expect(computeMealSlotTakeaway([
   { slot: 'dinner', count: 5 },
   { slot: 'lunch', count: 5 },
  ])).toBeNull();
  expect(computeMealSlotTakeaway([
   { slot: 'dinner', count: Number.NaN },
   { slot: 'lunch', count: -4 },
   { slot: 'snack', count: Number.POSITIVE_INFINITY },
  ])).toBeNull();
 });
});

describe('computeMealSlotsTakeaway', () => {
  it('states most frequent meal slot with order count and formatted rupees spend', () => {
    expect(computeMealSlotsTakeaway([
      { key: 'breakfast', orders: 12, spend: 3600 },
      { key: 'lunch', orders: 25, spend: 8500 },
      { key: 'snack', orders: 8, spend: 1900 },
      { key: 'dinner', orders: 45, spend: 18500 },
      { key: 'late_night', orders: 5, spend: 2200 },
    ])).toBe('Dinner is your most frequent meal slot with 45 orders (₹18,500)');
  });

  it('uses singular "1 order" when the top meal slot has 1 order', () => {
    expect(computeMealSlotsTakeaway([
      { key: 'lunch', orders: 1, spend: 350 },
    ])).toBe('Lunch is your most frequent meal slot with 1 order (₹350)');
  });

  it('formats caption without spend parenthesis when spend is zero or not provided', () => {
    expect(computeMealSlotsTakeaway([
      { key: 'breakfast', orders: 10, spend: 0 },
      { key: 'lunch', orders: 4 },
    ])).toBe('Breakfast is your most frequent meal slot with 10 orders');
  });

  it('aggregates duplicate slots and humanizes snake_case keys', () => {
    expect(computeMealSlotsTakeaway([
      { key: 'late_night', orders: 10, spend: 3000 },
      { key: 'Late-Night', orders: 8, spend: 2400 },
      { key: 'lunch', orders: 12, spend: 4000 },
    ])).toBe('Late night is your most frequent meal slot with 18 orders (₹5,400)');
  });

  it('supports alias fields slot, count, and amount', () => {
    expect(computeMealSlotsTakeaway([
      { slot: 'dinner', count: 20, amount: 9000 },
      { slot: 'lunch', count: 15, amount: 6000 },
    ])).toBe('Dinner is your most frequent meal slot with 20 orders (₹9,000)');
  });

  it('returns null for missing, empty, zero, invalid, and tied data', () => {
    expect(computeMealSlotsTakeaway(null)).toBeNull();
    expect(computeMealSlotsTakeaway(undefined)).toBeNull();
    expect(computeMealSlotsTakeaway([])).toBeNull();
    expect(computeMealSlotsTakeaway([{ key: 'dinner', orders: 0 }])).toBeNull();
    expect(computeMealSlotsTakeaway([
      { key: 'dinner', orders: 15, spend: 6000 },
      { key: 'lunch', orders: 15, spend: 5000 },
    ])).toBeNull();
    expect(computeMealSlotsTakeaway([
      { key: 'dinner', orders: Number.NaN },
      { key: 'lunch', orders: -3 },
    ])).toBeNull();
  });
});

describe('computePlatformTakeaway', () => {
 it('states the platform share of total food spend', () => {
  expect(computePlatformTakeaway([
   { platform: 'Swiggy', spend: 6400 },
   { platform: 'Zomato', spend: 2600 },
   { platform: 'EatSure', spend: 1000 },
  ])).toBe('Swiggy represents 64% of total food spend');
 });

 it('aggregates duplicate platforms and rounds the percentage', () => {
  expect(computePlatformTakeaway([
   { platform: 'Swiggy', spend: 4000 },
   { platform: 'swiggy', spend: 2400 },
   { platform: 'Zomato', spend: 3600 },
  ])).toBe('Swiggy represents 64% of total food spend');
  expect(computePlatformTakeaway([
   { platform: 'Swiggy', spend: 2 },
   { platform: 'Zomato', spend: 1 },
  ])).toBe('Swiggy represents 67% of total food spend');
 });

 it('returns null for missing, empty, zero, invalid and tied data', () => {
  expect(computePlatformTakeaway(null)).toBeNull();
  expect(computePlatformTakeaway(undefined)).toBeNull();
  expect(computePlatformTakeaway([])).toBeNull();
  expect(computePlatformTakeaway([
   { platform: 'Swiggy', spend: 0 },
   { platform: 'Zomato', spend: 0 },
  ])).toBeNull();
  expect(computePlatformTakeaway([
   { platform: 'Swiggy', spend: 500 },
   { platform: 'Zomato', spend: 500 },
  ])).toBeNull();
  expect(computePlatformTakeaway([
   { platform: 'Swiggy', spend: Number.NaN },
   { platform: 'Zomato', spend: -20 },
  ])).toBeNull();
 });
});

describe('computeTopRestaurantTakeaway', () => {
 it('names the restaurant with the most orders', () => {
  expect(computeTopRestaurantTakeaway([
   { name: 'Behrouz Biryani', count: 18 },
   { name: 'Pizza Hut', count: 12 },
   { name: "Domino's", count: 9 },
  ])).toBe('Top restaurant is Behrouz Biryani with 18 orders');
 });

 it('uses the singular unit for one order and aggregates duplicate names', () => {
  expect(computeTopRestaurantTakeaway([{ name: 'Behrouz Biryani', count: 1 }]))
   .toBe('Top restaurant is Behrouz Biryani with 1 order');
  expect(computeTopRestaurantTakeaway([
   { name: 'Behrouz Biryani', count: 10 },
   { name: 'Behrouz Biryani', count: 8 },
   { name: 'Pizza Hut', count: 12 },
  ])).toBe('Top restaurant is Behrouz Biryani with 18 orders');
 });

 it('returns null for missing, empty, zero, invalid and tied data', () => {
  expect(computeTopRestaurantTakeaway(null)).toBeNull();
  expect(computeTopRestaurantTakeaway(undefined)).toBeNull();
  expect(computeTopRestaurantTakeaway([])).toBeNull();
  expect(computeTopRestaurantTakeaway([{ name: 'Behrouz Biryani', count: 0 }])).toBeNull();
  expect(computeTopRestaurantTakeaway([
   { name: 'Behrouz Biryani', count: 10 },
   { name: 'Pizza Hut', count: 10 },
  ])).toBeNull();
  expect(computeTopRestaurantTakeaway([
   { name: 'Behrouz Biryani', count: Number.NaN },
   { name: 'Pizza Hut', count: -3 },
  ])).toBeNull();
 });
});

describe('computeSpendTrendTakeaway', () => {
 it('reports the peak month and its total spend', () => {
  expect(computeSpendTrendTakeaway([
   { date: '2025-08-12', amount: 8000 },
   { date: '2025-09-03', amount: 10000 },
   { date: '2025-10-21', amount: 12450 },
  ])).toBe('Monthly spending peaked in October at ₹12,450');
 });

 it('sums multiple orders inside the same month', () => {
  expect(computeSpendTrendTakeaway([
   { date: '2025-10-02', amount: 5000 },
   { date: '2025-10-27', amount: 7450 },
   { date: '2025-09-14', amount: 10000 },
  ])).toBe('Monthly spending peaked in October at ₹12,450');
 });

 it('formats large amounts with Indian digit grouping', () => {
  expect(computeSpendTrendTakeaway([
   { date: '2025-10-15T12:30:00', amount: 1234567 },
   { date: '2025-09-01', amount: 1000 },
  ])).toBe('Monthly spending peaked in October at ₹12,34,567');
  expect(formatRupees(12450)).toBe('₹12,450');
  expect(formatRupees(12345678)).toBe('₹1,23,45,678');
  expect(formatRupees(999)).toBe('₹999');
 });

 it('returns null for missing, empty, zero, invalid and tied data', () => {
  expect(computeSpendTrendTakeaway(null)).toBeNull();
  expect(computeSpendTrendTakeaway(undefined)).toBeNull();
  expect(computeSpendTrendTakeaway([])).toBeNull();
  expect(computeSpendTrendTakeaway([
   { date: '2025-10-01', amount: 0 },
   { date: '2025-09-01', amount: 0 },
  ])).toBeNull();
  expect(computeSpendTrendTakeaway([
   { date: '2025-10-01', amount: 5000 },
   { date: '2025-09-01', amount: 5000 },
  ])).toBeNull();
  expect(computeSpendTrendTakeaway([
   { date: 'not-a-date', amount: 9000 },
   { date: '', amount: 4000 },
  ])).toBeNull();
 });
});

describe('computeDayTypeTakeaway', () => {
 it('states the share of spend for the busiest day type', () => {
  expect(computeDayTypeTakeaway([
   { dayType: 'weekend', amount: 5500 },
   { dayType: 'weekday', amount: 4500 },
  ])).toBe('Weekends account for 55% of total spend');
 });

 it('normalizes case and pluralizes custom day types', () => {
  expect(computeDayTypeTakeaway([
   { dayType: 'WEEKEND', amount: 3000 },
   { dayType: 'Weekday', amount: 1000 },
  ])).toBe('Weekends account for 75% of total spend');
  expect(computeDayTypeTakeaway([
   { dayType: 'holiday', amount: 30 },
   { dayType: 'weekday', amount: 10 },
  ])).toBe('Holidays account for 75% of total spend');
 });

 it('rounds percentages to whole numbers', () => {
  expect(computeDayTypeTakeaway([
   { dayType: 'weekend', amount: 2 },
   { dayType: 'weekday', amount: 1 },
  ])).toBe('Weekends account for 67% of total spend');
 });

 it('returns null for missing, empty, zero, invalid and tied data', () => {
  expect(computeDayTypeTakeaway(null)).toBeNull();
  expect(computeDayTypeTakeaway(undefined)).toBeNull();
  expect(computeDayTypeTakeaway([])).toBeNull();
  expect(computeDayTypeTakeaway([
   { dayType: 'weekend', amount: 0 },
   { dayType: 'weekday', amount: 0 },
  ])).toBeNull();
  expect(computeDayTypeTakeaway([
   { dayType: 'weekend', amount: 2500 },
   { dayType: 'weekday', amount: 2500 },
  ])).toBeNull();
  expect(computeDayTypeTakeaway([
   { dayType: 'weekend', amount: Number.NaN },
   { dayType: 'weekday', amount: -100 },
  ])).toBeNull();
 });
});

describe('purity', () => {
 it('does not mutate its inputs', () => {
  const mealSlots = Object.freeze([
   Object.freeze({ slot: 'dinner', count: 48 }),
   Object.freeze({ slot: 'lunch', count: 52 }),
  ]);
  const platforms = Object.freeze([Object.freeze({ platform: 'Swiggy', spend: 6400 })]);
  const restaurants = Object.freeze([Object.freeze({ name: 'Behrouz Biryani', count: 18 })]);
  const trend = Object.freeze([
   Object.freeze({ date: '2025-10-01', amount: 12450 }),
   Object.freeze({ date: '2025-09-01', amount: 10000 }),
  ]);
  const dayTypes = Object.freeze([
   Object.freeze({ dayType: 'weekend', amount: 5500 }),
   Object.freeze({ dayType: 'weekday', amount: 4500 }),
  ]);

  computeMealSlotTakeaway(mealSlots);
  computePlatformTakeaway(platforms);
  computeTopRestaurantTakeaway(restaurants);
  computeSpendTrendTakeaway(trend);
  computeDayTypeTakeaway(dayTypes);

  expect(mealSlots).toEqual([
   { slot: 'dinner', count: 48 },
   { slot: 'lunch', count: 52 },
  ]);
  expect(platforms).toEqual([{ platform: 'Swiggy', spend: 6400 }]);
  expect(restaurants).toEqual([{ name: 'Behrouz Biryani', count: 18 }]);
  expect(trend).toEqual([
   { date: '2025-10-01', amount: 12450 },
   { date: '2025-09-01', amount: 10000 },
  ]);
  expect(dayTypes).toEqual([
   { dayType: 'weekend', amount: 5500 },
   { dayType: 'weekday', amount: 4500 },
  ]);
 });
});

describe('computeBillWaterfallTakeaway', () => {
 it('states discounts saved and fees added relative to item subtotal', () => {
  const costWaterfall = {
   subtotal: 10000,
   food_discount: -2000,
   net_delivery: 400,
   packaging: 100,
   platform: 200,
   tax: 500,
   tip: 100,
   other: 0,
   residual: 0,
   provider_paid: 9300,
   refunds: 0,
  };
  expect(computeBillWaterfallTakeaway(null, costWaterfall)).toBe(
   'Discounts saved ₹2,000 (20%) while fees added ₹1,300 (13%) to item subtotal',
  );
 });

 it('states only discounts saved when fees are zero', () => {
  const costWaterfall = {
   subtotal: 1000,
   food_discount: -250,
   net_delivery: 0,
   packaging: 0,
   platform: 0,
   tax: 0,
   tip: 0,
   other: 0,
   residual: 0,
   provider_paid: 750,
   refunds: 0,
  };
  expect(computeBillWaterfallTakeaway(null, costWaterfall)).toBe(
   'Discounts saved ₹250 (25%) on item subtotal',
  );
 });

 it('states only fees added when discounts are zero', () => {
  const costWaterfall = {
   subtotal: 1000,
   food_discount: 0,
   net_delivery: 100,
   packaging: 50,
   platform: 0,
   tax: 0,
   tip: 0,
   other: 0,
   residual: 0,
   provider_paid: 1150,
   refunds: 0,
  };
  expect(computeBillWaterfallTakeaway(null, costWaterfall)).toBe(
   'Fees and taxes added ₹150 (15%) to item subtotal',
  );
 });

 it('states final paid equals subtotal when no discounts and no fees', () => {
  const costWaterfall = {
   subtotal: 1000,
   food_discount: 0,
   net_delivery: 0,
   packaging: 0,
   platform: 0,
   tax: 0,
   tip: 0,
   other: 0,
   residual: 0,
   provider_paid: 1000,
   refunds: 0,
  };
  expect(computeBillWaterfallTakeaway(null, costWaterfall)).toBe(
   'Final paid equals item subtotal at ₹1,000',
  );
 });

 it('derives values from steps array when costWaterfall is not provided', () => {
  const steps = [
   { label: 'subtotal', amount: 5000, baseline: 0, height: 5000, direction: 'up' },
   { label: 'food discount', amount: -500, baseline: 4500, height: 500, direction: 'down' },
   { label: 'delivery', amount: 250, baseline: 4500, height: 250, direction: 'up' },
   { label: 'Final paid', amount: 4750, baseline: 0, height: 4750, direction: 'total' },
  ];
  expect(computeBillWaterfallTakeaway(steps, null)).toBe(
   'Discounts saved ₹500 (10%) while fees added ₹250 (5%) to item subtotal',
  );
 });

 it('returns null for missing, empty, zero or invalid data', () => {
  expect(computeBillWaterfallTakeaway(null, null)).toBeNull();
  expect(computeBillWaterfallTakeaway(undefined, undefined)).toBeNull();
  expect(computeBillWaterfallTakeaway([], null)).toBeNull();
  expect(
   computeBillWaterfallTakeaway(null, {
    subtotal: 0,
    food_discount: 0,
    net_delivery: 0,
    packaging: 0,
    platform: 0,
    tax: 0,
    tip: 0,
    other: 0,
    residual: 0,
    provider_paid: 0,
    refunds: 0,
   }),
  ).toBeNull();
  expect(
   computeBillWaterfallTakeaway(
    [{ label: 'subtotal', amount: 0, baseline: 0, height: 0, direction: 'up' }],
    null,
   ),
  ).toBeNull();
 });
});

import { computeDiscountBreakdownTakeaway } from './captions';

describe('computeDiscountBreakdownTakeaway', () => {
  it('states the share of total savings for the largest discount type', () => {
    expect(
      computeDiscountBreakdownTakeaway([
        { label: 'Food discount', amount: 4200 },
        { label: 'Delivery discount', amount: 1500 },
        { label: 'Other / unallocated discount', amount: 476 },
      ]),
    ).toBe('Food discounts represent 68% of total savings (₹4,200)');
  });

  it('aggregates duplicate discount types case-insensitively and humanizes snake_case', () => {
    expect(
      computeDiscountBreakdownTakeaway([
        { label: 'food_discount', amount: 3000 },
        { label: 'Food Discount', amount: 1200 },
        { label: 'delivery_discount', amount: 1976 },
      ]),
    ).toBe('Food discounts represent 68% of total savings (₹4,200)');
  });

  it('handles 100% single discount and preserves already plural labels', () => {
    expect(
      computeDiscountBreakdownTakeaway([
        { label: 'Coupons', amount: 500 },
      ]),
    ).toBe('Coupons represent 100% of total savings (₹500)');
  });

  it('returns null for missing, empty, zero, invalid and tied data', () => {
    expect(computeDiscountBreakdownTakeaway(null)).toBeNull();
    expect(computeDiscountBreakdownTakeaway(undefined)).toBeNull();
    expect(computeDiscountBreakdownTakeaway([])).toBeNull();
    expect(
      computeDiscountBreakdownTakeaway([
        { label: 'Food discount', amount: 0 },
        { label: 'Delivery discount', amount: 0 },
      ]),
    ).toBeNull();
    expect(
      computeDiscountBreakdownTakeaway([
        { label: 'Food discount', amount: -50 },
      ]),
    ).toBeNull();
    expect(
      computeDiscountBreakdownTakeaway([
        { label: 'Food discount', amount: 500 },
        { label: 'Delivery discount', amount: 500 },
      ]),
    ).toBeNull();
    expect(
      computeDiscountBreakdownTakeaway([
        { label: 'Food discount', amount: Number.NaN },
        { label: 'Delivery discount', amount: Number.POSITIVE_INFINITY },
      ]),
    ).toBeNull();
  });
});

import { computeYearOverYearTakeaway } from './captions';

describe('computeYearOverYearTakeaway', () => {
  it('computes spend increase across comparable months between the latest two years', () => {
    expect(
      computeYearOverYearTakeaway([
        { year: 2024, month: 1, spend: 10000 },
        { year: 2024, month: 2, spend: 12000 },
        { year: 2025, month: 1, spend: 14000 },
        { year: 2025, month: 2, spend: 22200 },
      ]),
    ).toBe('2025 spend exceeded 2024 by ₹14,200 across comparable months');
  });

  it('computes spend reduction across comparable months', () => {
    expect(
      computeYearOverYearTakeaway([
        { year: 2024, month: 1, spend: 15000 },
        { year: 2025, month: 1, spend: 10000 },
      ]),
    ).toBe('2025 spend was ₹5,000 lower than 2024 across comparable months');
  });

  it('handles exact spend match across comparable months', () => {
    expect(
      computeYearOverYearTakeaway([
        { year: 2024, month: 1, spend: 8000 },
        { year: 2025, month: 1, spend: 8000 },
      ]),
    ).toBe('2025 spend matched 2024 across comparable months');
  });

  it('compares the most recent two years in multi-year datasets and ignores non-overlapping months', () => {
    expect(
      computeYearOverYearTakeaway([
        { year: 2023, month: 1, spend: 5000 },
        { year: 2024, month: 1, spend: 8000 },
        { year: 2024, month: 2, spend: 9000 },
        { year: 2024, month: 3, spend: 11000 }, // No 2025 month 3
        { year: 2025, month: 1, spend: 10000 },
        { year: 2025, month: 2, spend: 12000 },
        { year: 2025, month: 4, spend: 7000 }, // No 2024 month 4
      ]),
    ).toBe('2025 spend exceeded 2024 by ₹5,000 across comparable months');
  });

  it('returns null for missing, empty, invalid, all-zero, or single-year data', () => {
    expect(computeYearOverYearTakeaway(null)).toBeNull();
    expect(computeYearOverYearTakeaway(undefined)).toBeNull();
    expect(computeYearOverYearTakeaway([])).toBeNull();
    expect(
      computeYearOverYearTakeaway([
        { year: 2024, month: 1, spend: 5000 },
      ]),
    ).toBeNull();
    expect(
      computeYearOverYearTakeaway([
        { year: 2024, month: 1, spend: 0 },
        { year: 2025, month: 1, spend: 0 },
      ]),
    ).toBeNull();
    expect(
      computeYearOverYearTakeaway([
        { year: 2024, month: 1, spend: 5000 },
        { year: 2025, month: 2, spend: 6000 }, // No overlapping month
      ]),
    ).toBeNull();
    expect(
      computeYearOverYearTakeaway([
        { year: 2024, month: 1, spend: Number.NaN },
        { year: 2025, month: 1, spend: 5000 },
      ]),
    ).toBeNull();
  });
});

describe('computeFeeComponentsTakeaway', () => {
  it('captions dominant platform fee across months', () => {
    expect(
      computeFeeComponentsTakeaway([
        {
          month: '2024-01',
          platform: 1000,
          net_delivery: 500,
          packaging: 200,
          tax: 800,
        },
        {
          month: '2024-02',
          platform: 850,
          net_delivery: 500,
          packaging: 300,
          tax: 718,
        },
      ]),
    ).toBe('Platform fees represent 38% of total fees (₹1,850)');
  });

  it('captions dominant delivery fee', () => {
    expect(
      computeFeeComponentsTakeaway([
        {
          month: '2024-01',
          net_delivery: 2200,
          packaging: 800,
          platform: 1000,
          tax: 888,
        },
      ]),
    ).toBe('Delivery fees represent 45% of total fees (₹2,200)');
  });

  it('captions dominant packaging fee and taxes', () => {
    expect(
      computeFeeComponentsTakeaway([
        {
          month: '2024-01',
          net_delivery: 100,
          packaging: 600,
          platform: 150,
          tax: 150,
        },
      ]),
    ).toBe('Packaging fees represent 60% of total fees (₹600)');

    expect(
      computeFeeComponentsTakeaway([
        {
          month: '2024-01',
          net_delivery: 100,
          packaging: 100,
          platform: 100,
          tax: 700,
        },
      ]),
    ).toBe('Taxes represent 70% of total fees (₹700)');
  });

  it('supports generic component breakdown items and field aliases', () => {
    expect(
      computeFeeComponentsTakeaway([
        { label: 'platform', amount: 900 },
        { label: 'delivery', amount: 300 },
      ]),
    ).toBe('Platform fees represent 75% of total fees (₹900)');

    expect(
      computeFeeComponentsTakeaway([
        { delivery_fee: 600, packaging_fee: 200, platform_fee: 100, taxes: 100 },
      ]),
    ).toBe('Delivery fees represent 60% of total fees (₹600)');
  });

  it('returns null for missing, empty, zero, negative, invalid and tied fee data', () => {
    expect(computeFeeComponentsTakeaway(null)).toBeNull();
    expect(computeFeeComponentsTakeaway(undefined)).toBeNull();
    expect(computeFeeComponentsTakeaway([])).toBeNull();
    expect(
      computeFeeComponentsTakeaway([
        { platform: 0, net_delivery: 0, packaging: 0, tax: 0 },
      ]),
    ).toBeNull();
    expect(
      computeFeeComponentsTakeaway([
        { platform: 500, net_delivery: 500, packaging: 100, tax: 100 },
      ]),
    ).toBeNull();
    expect(
      computeFeeComponentsTakeaway([
        { platform: -50, net_delivery: Number.NaN },
      ]),
    ).toBeNull();
  });
});

describe('computeFeeScatterTakeaway', () => {
  it('computes average fee burden percentage across valid orders (CC-8, S-044)', () => {
    expect(
      computeFeeScatterTakeaway([
        { amount: 500, fees: 70, fee_percent: 14 },
      ]),
    ).toBe('Average fee burden is 14% of order value');

    expect(
      computeFeeScatterTakeaway([
        { amount: 1000, fees: 140, fee_percent: 14 },
        { amount: 500, fees: 70, fee_percent: 14 },
      ]),
    ).toBe('Average fee burden is 14% of order value');
  });

  it('calculates weighted fee burden when items have varying amounts and fees', () => {
    // Total fees: 150 + 60 = 210, Total amount: 1000 + 500 = 1500 => 210 / 1500 = 14%
    expect(
      computeFeeScatterTakeaway([
        { amount: 1000, fees: 150, fee_percent: 15 },
        { amount: 500, fees: 60, fee_percent: 12 },
      ]),
    ).toBe('Average fee burden is 14% of order value');
  });

  it('supports items without explicit fees by falling back to average fee_percent', () => {
    expect(
      computeFeeScatterTakeaway([
        { amount: 400, fee_percent: 10 },
        { amount: 600, fee_percent: 20 },
      ]),
    ).toBe('Average fee burden is 15% of order value');
  });

  it('filters out orders with null or non-finite fee_percent or non-positive amount', () => {
    expect(
      computeFeeScatterTakeaway([
        { amount: 500, fees: 70, fee_percent: 14 },
        { amount: 200, fees: 0, fee_percent: null },
        { amount: -50, fees: 10, fee_percent: 20 },
        { amount: 0, fees: 0, fee_percent: 0 },
        { amount: 300, fees: 30, fee_percent: Number.NaN },
      ]),
    ).toBe('Average fee burden is 14% of order value');
  });

  it('returns null on empty, null, undefined, or all-zero data', () => {
    expect(computeFeeScatterTakeaway(null)).toBeNull();
    expect(computeFeeScatterTakeaway(undefined)).toBeNull();
    expect(computeFeeScatterTakeaway([])).toBeNull();
    expect(
      computeFeeScatterTakeaway([
        { amount: 500, fees: 0, fee_percent: 0 },
      ]),
    ).toBeNull();
    expect(
      computeFeeScatterTakeaway([
        { amount: 100, fees: 0, fee_percent: 0 },
        { amount: 200, fees: 0, fee_percent: 0 },
      ]),
    ).toBeNull();
    expect(
      computeFeeScatterTakeaway([
        { amount: 500, fees: 0, fee_percent: null },
      ]),
    ).toBeNull();
  });
});

describe('computeCumulativeSpendTakeaway (CC-8, S-045)', () => {
  it('states total spend, active months, and milestones crossed', () => {
    // 18 months totaling 145000: 14 milestones at 10000 step
    const data = Array.from({ length: 18 }, (_, i) => ({
      month: `2024-${String(i + 1).padStart(2, '0')}`,
      spend: i === 17 ? 9000 : 8000, // 17 * 8000 + 9000 = 145000
    }));
    expect(computeCumulativeSpendTakeaway(data)).toBe(
      'Total spend reached ₹1,45,000 across 18 months, crossing 14 milestones',
    );
  });

  it('handles singular month and singular milestone', () => {
    expect(
      computeCumulativeSpendTakeaway([
        { month: '2024-01', spend: 10000 },
      ]),
    ).toBe('Total spend reached ₹10,000 across 1 month, crossing 1 milestone');
  });

  it('handles zero milestones when spend is under threshold', () => {
    expect(
      computeCumulativeSpendTakeaway([
        { month: '2024-01', spend: 5000 },
      ]),
    ).toBe('Total spend reached ₹5,000 across 1 month, crossing 0 milestones');
  });

  it('supports custom milestone step', () => {
    expect(
      computeCumulativeSpendTakeaway(
        [
          { month: '2024-01', spend: 25000 },
          { month: '2024-02', spend: 25000 },
        ],
        20000,
      ),
    ).toBe('Total spend reached ₹50,000 across 2 months, crossing 2 milestones');
  });

  it('supports amount property as fallback for spend', () => {
    expect(
      computeCumulativeSpendTakeaway([
        { month: '2024-01', amount: 12000 },
        { month: '2024-02', amount: 8000 },
      ]),
    ).toBe('Total spend reached ₹20,000 across 2 months, crossing 2 milestones');
  });

  it('aggregates duplicate month entries', () => {
    expect(
      computeCumulativeSpendTakeaway([
        { month: '2024-01', spend: 5000 },
        { month: '2024-01', spend: 5000 },
      ]),
    ).toBe('Total spend reached ₹10,000 across 1 month, crossing 1 milestone');
  });

  it('returns null on empty, null, undefined, all-zero or non-positive data', () => {
    expect(computeCumulativeSpendTakeaway(null)).toBeNull();
    expect(computeCumulativeSpendTakeaway(undefined)).toBeNull();
    expect(computeCumulativeSpendTakeaway([])).toBeNull();
    expect(computeCumulativeSpendTakeaway([{ spend: 0 }])).toBeNull();
    expect(computeCumulativeSpendTakeaway([{ spend: -500 }])).toBeNull();
    expect(
      computeCumulativeSpendTakeaway([
        { month: '2024-01', spend: 0 },
        { month: '2024-02', spend: 0 },
      ]),
    ).toBeNull();
  });
});

describe('computeOrderValueDistributionTakeaway (CC-8, S-046)', () => {
  it('states median order value and percentage of orders under ₹500', () => {
    // 100 orders: 64 orders under 500, median 320
    // Example: 64 orders of 250 and 36 orders of 750 => sorted: indices 0-63 are 250, 64-99 are 750
    // Let's create an explicit set with median 320 and 64% under 500
    // 50 orders: 32 orders under 500 (64%).
    // Median of 50 items is (numbers[24] + numbers[25]) / 2.
    // If indices 0-23 are 200, index 24 is 320, index 25 is 320, indices 26-31 are 450 (total 32 under 500),
    // and indices 32-49 are 800 (18 orders >= 500). Total 50 items.
    // 32 / 50 = 64% under 500. Median = (320 + 320) / 2 = 320.
    const orders = [
      ...Array(24).fill(200),
      320,
      320,
      ...Array(6).fill(450),
      ...Array(18).fill(800),
    ];
    expect(computeOrderValueDistributionTakeaway(orders)).toBe(
      'Median order value is ₹320; 64% of orders are under ₹500',
    );
  });

  it('supports raw numbers and object arrays with final_amount_paid or amount or spend', () => {
    const fromObjects = [
      { final_amount_paid: 100 },
      { final_amount_paid: 200 },
      { final_amount_paid: 300 },
    ];
    expect(computeOrderValueDistributionTakeaway(fromObjects)).toBe(
      'Median order value is ₹200; 100% of orders are under ₹500',
    );

    const fromAmount = [
      { amount: 400 },
      { amount: 600 },
    ];
    expect(computeOrderValueDistributionTakeaway(fromAmount)).toBe(
      'Median order value is ₹500; 50% of orders are under ₹500',
    );
  });

  it('calculates median correctly for odd and even length arrays', () => {
    // Odd length
    expect(computeOrderValueDistributionTakeaway([100, 300, 800])).toBe(
      'Median order value is ₹300; 67% of orders are under ₹500',
    );
    // Even length
    expect(computeOrderValueDistributionTakeaway([200, 300, 400, 500])).toBe(
      'Median order value is ₹350; 75% of orders are under ₹500',
    );
  });

  it('supports custom threshold', () => {
    expect(computeOrderValueDistributionTakeaway([100, 200, 300, 400, 500], 300)).toBe(
      'Median order value is ₹300; 40% of orders are under ₹300',
    );
  });

  it('returns null on empty, null, undefined, all-zero or non-positive data', () => {
    expect(computeOrderValueDistributionTakeaway(null)).toBeNull();
    expect(computeOrderValueDistributionTakeaway(undefined)).toBeNull();
    expect(computeOrderValueDistributionTakeaway([])).toBeNull();
    expect(computeOrderValueDistributionTakeaway([0, 0, 0])).toBeNull();
    expect(computeOrderValueDistributionTakeaway([-100, -200])).toBeNull();
    expect(computeOrderValueDistributionTakeaway([{ final_amount_paid: 0 }])).toBeNull();
    expect(computeOrderValueDistributionTakeaway([{ final_amount_paid: null }])).toBeNull();
    expect(computeOrderValueDistributionTakeaway([{ final_amount_paid: Number.NaN }])).toBeNull();
  });
});

describe('computeDailySpendTakeaway', () => {
  const sampleData = [
    { date: '2024-12-15', spend: 1200 },
    { date: '2025-01-10', spend: 850 },
    { date: '2025-10-24', spend: 3450 },
    { date: '2025-11-05', spend: 2100 },
  ];

  it('computes peak daily spend for a specified year', () => {
    expect(computeDailySpendTakeaway(sampleData, '2025')).toBe(
      'Highest daily spend in 2025 was ₹3,450 on 2025-10-24',
    );
    expect(computeDailySpendTakeaway(sampleData, 2024)).toBe(
      'Highest daily spend in 2024 was ₹1,200 on 2024-12-15',
    );
  });

  it('computes peak daily spend across all dates when year is omitted or null', () => {
    expect(computeDailySpendTakeaway(sampleData)).toBe(
      'Highest daily spend was ₹3,450 on 2025-10-24',
    );
    expect(computeDailySpendTakeaway(sampleData, null)).toBe(
      'Highest daily spend was ₹3,450 on 2025-10-24',
    );
    expect(computeDailySpendTakeaway(sampleData, '')).toBe(
      'Highest daily spend was ₹3,450 on 2025-10-24',
    );
  });

  it('supports amount field fallback when spend is omitted', () => {
    const dataWithAmount = [
      { date: '2025-05-01', amount: 990 },
      { date: '2025-05-02', amount: 1540 },
    ];
    expect(computeDailySpendTakeaway(dataWithAmount, '2025')).toBe(
      'Highest daily spend in 2025 was ₹1,540 on 2025-05-02',
    );
  });

  it('returns null on empty, null, undefined, all-zero, negative or invalid data', () => {
    expect(computeDailySpendTakeaway(null)).toBeNull();
    expect(computeDailySpendTakeaway(undefined)).toBeNull();
    expect(computeDailySpendTakeaway([])).toBeNull();
    expect(computeDailySpendTakeaway([{ date: '2025-01-01', spend: 0 }])).toBeNull();
    expect(computeDailySpendTakeaway([{ date: '2025-01-01', spend: -500 }])).toBeNull();
    expect(computeDailySpendTakeaway([{ date: '2025-01-01', spend: Number.NaN }])).toBeNull();
    expect(computeDailySpendTakeaway([{ date: '', spend: 1000 }])).toBeNull();
  });

  it('returns null when no data matches the requested year', () => {
    expect(computeDailySpendTakeaway(sampleData, '2023')).toBeNull();
  });
});

import { computeCuisineTakeaway } from './captions';

describe('computeCuisineTakeaway (CC-8, S-050)', () => {
  it('captions the cuisine with the largest spend and its share of total spend', () => {
    const data = [
      { name: 'North Indian', spend: 4200 },
      { name: 'Chinese & Asian', spend: 2800 },
      { name: 'Pizza & Italian', spend: 1800 },
      { name: 'Desserts', spend: 1200 },
    ];
    // Total spend: 10,000; North Indian: 4200 / 10000 = 42%
    expect(computeCuisineTakeaway(data)).toBe('North Indian accounts for 42% of food spend');
  });

  it('aggregates multiple entries with the same cuisine name', () => {
    const data = [
      { name: 'Biryani', spend: 3000 },
      { name: 'Biryani', spend: 2000 },
      { name: 'South Indian', spend: 2500 },
    ];
    // Total: 7500; Biryani: 5000 / 7500 = 67%
    expect(computeCuisineTakeaway(data)).toBe('Biryani accounts for 67% of food spend');
  });

  it('handles a single cuisine representing 100% of spend', () => {
    expect(computeCuisineTakeaway([{ name: 'Fast Food', spend: 1500 }])).toBe(
      'Fast Food accounts for 100% of food spend',
    );
  });

  it('supports value and amount fallback properties', () => {
    expect(
      computeCuisineTakeaway([
        { name: 'Burgers', value: 3000 },
        { name: 'Beverages', amount: 1000 },
      ]),
    ).toBe('Burgers accounts for 75% of food spend');
  });

  it('returns null on empty, null, undefined, all-zero, negative, or tied data', () => {
    expect(computeCuisineTakeaway(null)).toBeNull();
    expect(computeCuisineTakeaway(undefined)).toBeNull();
    expect(computeCuisineTakeaway([])).toBeNull();
    expect(computeCuisineTakeaway([{ name: 'Indian', spend: 0 }])).toBeNull();
    expect(computeCuisineTakeaway([{ name: 'Indian', spend: -100 }])).toBeNull();
    expect(computeCuisineTakeaway([{ name: 'Indian', spend: Number.NaN }])).toBeNull();
    expect(computeCuisineTakeaway([{ name: '', spend: 500 }])).toBeNull();
    // Tied winner: both 2000
    expect(
      computeCuisineTakeaway([
        { name: 'North Indian', spend: 2000 },
        { name: 'Chinese', spend: 2000 },
      ]),
    ).toBeNull();
  });
});

import { computeNewVsRepeatTakeaway } from './captions';

describe('computeNewVsRepeatTakeaway (CC-8, S-051)', () => {
  it('computes overall repeat orders percentage share across monthly records', () => {
    // 32 new orders, 68 repeat orders -> total 100 -> 68%
    const data = [
      { month: '2024-01', new_orders: 12, repeat_orders: 18 },
      { month: '2024-02', new_orders: 10, repeat_orders: 20 },
      { month: '2024-03', new_orders: 10, repeat_orders: 30 },
    ];
    // total new = 32, total repeat = 68, total = 100 -> 68%
    expect(computeNewVsRepeatTakeaway(data)).toBe('Repeat orders account for 68% of orders overall');
  });

  it('handles 100% repeat orders', () => {
    expect(
      computeNewVsRepeatTakeaway([
        { month: '2024-01', new_orders: 0, repeat_orders: 25 },
        { month: '2024-02', new_orders: 0, repeat_orders: 25 },
      ]),
    ).toBe('Repeat orders account for 100% of orders overall');
  });

  it('handles 0% repeat orders (100% first-time discoveries)', () => {
    expect(
      computeNewVsRepeatTakeaway([
        { month: '2024-01', new_orders: 40, repeat_orders: 0 },
      ]),
    ).toBe('Repeat orders account for 0% of orders overall');
  });

  it('supports camelCase fallback field names (newOrders, repeatOrders)', () => {
    expect(
      computeNewVsRepeatTakeaway([
        { month: '2024-01', newOrders: 10, repeatOrders: 30 },
      ]),
    ).toBe('Repeat orders account for 75% of orders overall');
  });

  it('returns null on null, undefined, empty array, all-zero or invalid orders', () => {
    expect(computeNewVsRepeatTakeaway(null)).toBeNull();
    expect(computeNewVsRepeatTakeaway(undefined)).toBeNull();
    expect(computeNewVsRepeatTakeaway([])).toBeNull();
    expect(
      computeNewVsRepeatTakeaway([
        { month: '2024-01', new_orders: 0, repeat_orders: 0 },
      ]),
    ).toBeNull();
    expect(
      computeNewVsRepeatTakeaway([
        { month: '2024-01', new_orders: -5, repeat_orders: -10 },
      ]),
    ).toBeNull();
    expect(
      computeNewVsRepeatTakeaway([
        { month: '2024-01', new_orders: Number.NaN, repeat_orders: Number.NaN },
      ]),
    ).toBeNull();
  });
});

import { computeLoyaltyParetoTakeaway } from './captions';

describe('computeLoyaltyParetoTakeaway (CC-8, S-052)', () => {
  it('computes top N restaurants reaching 80% threshold', () => {
    // 40 + 20 + 10 + 10 = 80 out of 100 (exactly 80%)
    const data = [
      { name: 'Faasos', orders: 40 },
      { name: 'Behrouz Biryani', orders: 20 },
      { name: 'Oven Story', orders: 10 },
      { name: 'Lunchbox', orders: 10 },
      { name: 'Firangi Bake', orders: 10 },
      { name: 'Sweet Truth', orders: 10 },
    ];
    expect(computeLoyaltyParetoTakeaway(data)).toBe('Top 4 restaurants account for 80% of all orders');
  });

  it('computes top concentration when top 1 restaurant accounts for >= 80%', () => {
    const data = [
      { name: 'Faasos', orders: 85 },
      { name: 'Behrouz Biryani', orders: 15 },
    ];
    expect(computeLoyaltyParetoTakeaway(data)).toBe('Top restaurant accounts for 85% of all orders');
  });

  it('handles single restaurant with 100% of orders', () => {
    const data = [{ name: 'Faasos', orders: 12 }];
    expect(computeLoyaltyParetoTakeaway(data)).toBe('Top restaurant accounts for 100% of all orders');
  });

  it('aggregates duplicate entries by restaurant name and supports count fallback', () => {
    const data = [
      { name: 'Faasos', count: 25 },
      { name: 'Faasos', orders: 25 }, // total 50
      { name: 'Behrouz', orders: 20 },
      { name: 'Biryani Blues', orders: 15 }, // cum = 85 out of 100
      { name: 'KFC', orders: 15 },
    ];
    // 50 + 20 + 15 = 85% -> Top 3 restaurants
    expect(computeLoyaltyParetoTakeaway(data)).toBe('Top 3 restaurants account for 85% of all orders');
  });

  it('returns null on null, undefined, empty array, all-zero or invalid order counts', () => {
    expect(computeLoyaltyParetoTakeaway(null)).toBeNull();
    expect(computeLoyaltyParetoTakeaway(undefined)).toBeNull();
    expect(computeLoyaltyParetoTakeaway([])).toBeNull();
    expect(computeLoyaltyParetoTakeaway([{ name: 'Faasos', orders: 0 }])).toBeNull();
    expect(computeLoyaltyParetoTakeaway([{ name: 'Faasos', orders: -5 }])).toBeNull();
    expect(computeLoyaltyParetoTakeaway([{ name: 'Faasos', orders: Number.NaN }])).toBeNull();
    expect(computeLoyaltyParetoTakeaway([{ name: '', orders: 10 }])).toBeNull();
  });
});

import { computeDietTakeaway } from './captions';

describe('computeDietTakeaway (CC-8, S-053)', () => {
  it('computes percentage share for predominant Veg diet category', () => {
    const data = [
      { diet: 'Veg', quantity: 72, item_lines: 15, line_total: 2500 },
      { diet: 'Non-veg', quantity: 28, item_lines: 8, line_total: 1800 },
    ];
    expect(computeDietTakeaway(data)).toBe('Veg items represent 72% of total order quantity');
  });

  it('computes percentage share for predominant Non-veg diet category', () => {
    const data = [
      { diet: 'Veg', quantity: 30, item_lines: 5, line_total: 1000 },
      { diet: 'Non-veg', quantity: 70, item_lines: 12, line_total: 3500 },
    ];
    expect(computeDietTakeaway(data)).toBe('Non-veg items represent 70% of total order quantity');
  });

  it('handles Unknown category when largest', () => {
    const data = [
      { diet: 'Veg', quantity: 10 },
      { diet: 'Non-veg', quantity: 15 },
      { diet: 'Unknown', quantity: 75 },
    ];
    expect(computeDietTakeaway(data)).toBe('Unknown items represent 75% of total order quantity');
  });

  it('normalizes varying casing and formatting (e.g. non_veg, veg, unknown)', () => {
    const data = [
      { diet: 'non_veg', quantity: 60 },
      { diet: 'veg', quantity: 40 },
    ];
    expect(computeDietTakeaway(data)).toBe('Non-veg items represent 60% of total order quantity');
  });

  it('aggregates duplicate entries and falls back to item_lines if quantity is missing', () => {
    const data = [
      { diet: 'Veg', quantity: 30 },
      { diet: 'Veg', quantity: 20 },
      { diet: 'Non-veg', item_lines: 25 },
    ];
    // Veg = 50, Non-veg = 25, total = 75 -> 50/75 = 67%
    expect(computeDietTakeaway(data)).toBe('Veg items represent 67% of total order quantity');
  });

  it('returns null when categories are tied', () => {
    const data = [
      { diet: 'Veg', quantity: 50 },
      { diet: 'Non-veg', quantity: 50 },
    ];
    expect(computeDietTakeaway(data)).toBeNull();
  });

  it('returns null on null, undefined, empty array, or all-zero quantities', () => {
    expect(computeDietTakeaway(null)).toBeNull();
    expect(computeDietTakeaway(undefined)).toBeNull();
    expect(computeDietTakeaway([])).toBeNull();
    expect(computeDietTakeaway([{ diet: 'Veg', quantity: 0 }])).toBeNull();
    expect(computeDietTakeaway([{ diet: 'Veg', quantity: -10 }])).toBeNull();
    expect(computeDietTakeaway([{ diet: 'Veg', quantity: Number.NaN }])).toBeNull();
    expect(computeDietTakeaway([{ diet: '', quantity: 10 }])).toBeNull();
  });
});

import { computeDishRankingTakeaway } from './captions';

describe('computeDishRankingTakeaway (CC-8, S-054)', () => {
  it('captions top dish by quantity volume with spend complement', () => {
    const data = [
      { name: 'Chicken Biryani', quantity: 28, amount: 6800 },
      { name: 'Butter Naan', quantity: 22, amount: 1100 },
      { name: 'Paneer Tikka', quantity: 12, amount: 3600 },
    ];
    expect(computeDishRankingTakeaway(data, 'quantity')).toBe(
      'Top dish is Chicken Biryani with 28 orders (₹6,800)',
    );
    // Defaults to quantity
    expect(computeDishRankingTakeaway(data)).toBe(
      'Top dish is Chicken Biryani with 28 orders (₹6,800)',
    );
  });

  it('handles singular order correctly for quantity metric', () => {
    const data = [{ name: 'Chef Special', quantity: 1, amount: 750 }];
    expect(computeDishRankingTakeaway(data, 'quantity')).toBe(
      'Top dish is Chef Special with 1 order (₹750)',
    );
  });

  it('omits amount when zero or missing in quantity mode', () => {
    const data = [{ name: 'Complimentary Dip', quantity: 15, amount: 0 }];
    expect(computeDishRankingTakeaway(data, 'quantity')).toBe(
      'Top dish is Complimentary Dip with 15 orders',
    );
  });

  it('captions top dish by expenditure amount with order count complement', () => {
    const data = [
      { name: 'Chicken Biryani', quantity: 28, amount: 6800 },
      { name: 'Mutton Mandi', quantity: 10, amount: 9500 },
    ];
    expect(computeDishRankingTakeaway(data, 'amount')).toBe(
      'Top dish is Mutton Mandi with ₹9,500 (10 orders)',
    );
  });

  it('handles singular order correctly for amount metric', () => {
    const data = [{ name: 'Royal Platter', quantity: 1, amount: 3500 }];
    expect(computeDishRankingTakeaway(data, 'amount')).toBe(
      'Top dish is Royal Platter with ₹3,500 (1 order)',
    );
  });

  it('omits quantity when zero or missing in amount mode', () => {
    const data = [{ name: 'Custom Catering', quantity: 0, amount: 12000 }];
    expect(computeDishRankingTakeaway(data, 'amount')).toBe(
      'Top dish is Custom Catering with ₹12,000',
    );
  });

  it('aggregates duplicate dish entries by name', () => {
    const data = [
      { name: 'Chicken Biryani', quantity: 15, amount: 3400 },
      { name: 'Chicken Biryani', quantity: 13, amount: 3400 },
      { name: 'Butter Naan', quantity: 20, amount: 1000 },
    ];
    expect(computeDishRankingTakeaway(data, 'quantity')).toBe(
      'Top dish is Chicken Biryani with 28 orders (₹6,800)',
    );
  });

  it('returns null when top dishes are tied on the active metric', () => {
    const tiedByQty = [
      { name: 'Dish A', quantity: 20, amount: 500 },
      { name: 'Dish B', quantity: 20, amount: 600 },
    ];
    expect(computeDishRankingTakeaway(tiedByQty, 'quantity')).toBeNull();

    const tiedByAmt = [
      { name: 'Dish A', quantity: 10, amount: 1000 },
      { name: 'Dish B', quantity: 15, amount: 1000 },
    ];
    expect(computeDishRankingTakeaway(tiedByAmt, 'amount')).toBeNull();
  });

  it('returns null on null, undefined, empty array, or zero/invalid data', () => {
    expect(computeDishRankingTakeaway(null)).toBeNull();
    expect(computeDishRankingTakeaway(undefined)).toBeNull();
    expect(computeDishRankingTakeaway([])).toBeNull();
    expect(computeDishRankingTakeaway([{ name: 'Biryani', quantity: 0, amount: 0 }])).toBeNull();
    expect(computeDishRankingTakeaway([{ name: 'Biryani', quantity: -5, amount: -100 }])).toBeNull();
    expect(computeDishRankingTakeaway([{ name: 'Biryani', quantity: Number.NaN }])).toBeNull();
    expect(computeDishRankingTakeaway([{ name: '', quantity: 10, amount: 1000 }])).toBeNull();
  });
});

describe('computeHourWeekdayTakeaway', () => {
  it('identifies the peak day and hour with order count', () => {
    // Friday (weekday 4), 20:00 -> key = 4 * 24 + 20 = 116
    const data = [
      { key: '0', orders: 2, spend: 300 },
      { key: '116', orders: 15, spend: 3500 },
      { key: '25', orders: 5, spend: 1000 },
    ];
    expect(computeHourWeekdayTakeaway(data)).toBe('Peak ordering is Friday at 20:00 with 15 orders');
  });

  it('handles single order singular phrasing', () => {
    // Sunday (weekday 6), 13:00 -> key = 6 * 24 + 13 = 157
    const data = [
      { key: '157', orders: 1, spend: 250 },
    ];
    expect(computeHourWeekdayTakeaway(data)).toBe('Peak ordering is Sunday at 13:00 with 1 order');
  });

  it('aggregates duplicate keys correctly', () => {
    const data = [
      { key: 10, orders: 3, spend: 500 },
      { key: '10', orders: 4, spend: 700 },
    ];
    // weekday 0 (Monday), hour 10
    expect(computeHourWeekdayTakeaway(data)).toBe('Peak ordering is Monday at 10:00 with 7 orders');
  });

  it('returns null on tied peak cells', () => {
    const data = [
      { key: '10', orders: 8, spend: 1000 },
      { key: '20', orders: 8, spend: 1200 },
    ];
    expect(computeHourWeekdayTakeaway(data)).toBeNull();
  });

  it('returns null on empty, null, undefined, or all-zero orders', () => {
    expect(computeHourWeekdayTakeaway(null)).toBeNull();
    expect(computeHourWeekdayTakeaway(undefined)).toBeNull();
    expect(computeHourWeekdayTakeaway([])).toBeNull();
    expect(computeHourWeekdayTakeaway([{ key: '0', orders: 0, spend: 0 }])).toBeNull();
    expect(computeHourWeekdayTakeaway([{ key: '0', orders: -3, spend: 0 }])).toBeNull();
    expect(computeHourWeekdayTakeaway([{ key: 'invalid', orders: 5 }])).toBeNull();
    expect(computeHourWeekdayTakeaway([{ key: '200', orders: 5 }])).toBeNull();
  });
});

describe('computeWeekdayTakeaway', () => {
  it('states busiest day with order count, formatted spend, and weekend share', () => {
    // 24 on Sunday, total 63 orders across week (weekend = 24 / 63 = 38%)
    const data = [
      { day: 'Mon', orders: 5, spend: 1500 },
      { day: 'Tue', orders: 7, spend: 2100 },
      { day: 'Wed', orders: 8, spend: 2400 },
      { day: 'Thu', orders: 9, spend: 2800 },
      { day: 'Fri', orders: 10, spend: 3500 },
      { day: 'Sat', orders: 0, spend: 0 },
      { day: 'Sun', orders: 24, spend: 9200 },
    ];
    expect(computeWeekdayTakeaway(data)).toBe(
      'Sunday is your busiest day with 24 orders (₹9,200); weekends account for 38% of total orders',
    );
  });

  it('handles hour_weekday raw data with keys 0..167', () => {
    // Sun is weekday 6: keys 6*24 + 12 = 156
    const data = [
      { key: '0', orders: 5, spend: 1500 }, // Mon
      { key: '156', orders: 20, spend: 8000 }, // Sun
    ];
    expect(computeWeekdayTakeaway(data)).toBe(
      'Sunday is your busiest day with 20 orders (₹8,000); weekends account for 80% of total orders',
    );
  });

  it('uses singular "1 order" when the busiest day has 1 order', () => {
    const data = [{ weekday: 0, orders: 1, spend: 350 }];
    expect(computeWeekdayTakeaway(data)).toBe(
      'Monday is your busiest day with 1 order (₹350); weekends account for 0% of total orders',
    );
  });

  it('formats caption without spend parenthesis when spend is zero or not provided', () => {
    const data = [
      { weekday: 2, orders: 10, spend: 0 },
      { weekday: 5, orders: 4 },
    ];
    expect(computeWeekdayTakeaway(data)).toBe(
      'Wednesday is your busiest day with 10 orders; weekends account for 29% of total orders',
    );
  });

  it('aggregates multiple entries for the same weekday', () => {
    const data = [
      { day: 'Saturday', orders: 6, spend: 2000 },
      { day: 'Sat', orders: 8, spend: 2500 },
      { day: 'Sunday', orders: 4, spend: 1000 },
    ];
    // Sat has 14 orders (₹4,500), Sun has 4 orders, total = 18 orders (100% weekend)
    expect(computeWeekdayTakeaway(data)).toBe(
      'Saturday is your busiest day with 14 orders (₹4,500); weekends account for 100% of total orders',
    );
  });

  it('returns null on ties, missing, empty, or all-zero orders', () => {
    expect(computeWeekdayTakeaway(null)).toBeNull();
    expect(computeWeekdayTakeaway(undefined)).toBeNull();
    expect(computeWeekdayTakeaway([])).toBeNull();
    expect(computeWeekdayTakeaway([{ weekday: 0, orders: 0, spend: 0 }])).toBeNull();
    expect(computeWeekdayTakeaway([{ weekday: 0, orders: -2, spend: 0 }])).toBeNull();
    // Tied top days
    expect(
      computeWeekdayTakeaway([
        { day: 'Mon', orders: 10, spend: 1000 },
        { day: 'Tue', orders: 10, spend: 1000 },
      ]),
    ).toBeNull();
  });
});

describe('computeWeightedMedianGap', () => {
  it('computes weighted median for single gap entry', () => {
    expect(computeWeightedMedianGap([{ days: 2, orders: 10 }])).toBe(2);
  });

  it('computes weighted median for odd total intervals', () => {
    expect(
      computeWeightedMedianGap([
        { days: 1, orders: 2 },
        { days: 3, orders: 1 },
        { days: 7, orders: 2 },
      ]),
    ).toBe(3);
  });

  it('computes average of two middle values for even total intervals', () => {
    expect(
      computeWeightedMedianGap([
        { days: 1, orders: 1 },
        { days: 2, orders: 1 },
      ]),
    ).toBe(1.5);
  });

  it('correctly weighs large buckets', () => {
    expect(
      computeWeightedMedianGap([
        { days: 0, orders: 15 },
        { days: 10, orders: 2 },
      ]),
    ).toBe(0);
  });

  it('supports count alias and ignores non-finite/negative values', () => {
    expect(
      computeWeightedMedianGap([
        { days: -1, orders: 5 },
        { days: 2, count: 4 },
        { days: 4, orders: 0 },
        null,
      ]),
    ).toBe(2);
  });

  it('returns null for missing, empty, or invalid data', () => {
    expect(computeWeightedMedianGap(null)).toBeNull();
    expect(computeWeightedMedianGap(undefined)).toBeNull();
    expect(computeWeightedMedianGap([])).toBeNull();
    expect(computeWeightedMedianGap([{ days: 1, orders: 0 }])).toBeNull();
  });
});

describe('computeOrderGapsTakeaway', () => {
  it('formats median gap, longest gap, and percentage of orders placed within 3 days', () => {
    const gaps = [
      { days: 0, orders: 2 },
      { days: 1, orders: 6 },
      { days: 2, orders: 10 },
      { days: 5, orders: 4 },
      { days: 14, orders: 2 },
    ];
    // Total intervals = 24.
    // Within 3 days (days <= 3) = 2 + 6 + 10 = 18 -> 18/24 = 75%.
    // Median: 12th and 13th items -> both in days 2 -> median = 2.
    expect(computeOrderGapsTakeaway(gaps, 14)).toBe(
      'Median gap between orders is 2 days (longest gap: 14 days; 75% of orders placed within 3 days)',
    );
  });

  it('uses singular "1 day" when median or longest gap is 1', () => {
    const gaps = [
      { days: 1, orders: 5 },
    ];
    expect(computeOrderGapsTakeaway(gaps, 1)).toBe(
      'Median gap between orders is 1 day (longest gap: 1 day; 100% of orders placed within 3 days)',
    );
  });

  it('automatically derives longest gap from data if longest_gap is null or undefined', () => {
    const gaps = [
      { days: 1, orders: 3 },
      { days: 8, orders: 1 },
    ];
    expect(computeOrderGapsTakeaway(gaps, null)).toBe(
      'Median gap between orders is 1 day (longest gap: 8 days; 75% of orders placed within 3 days)',
    );
  });

  it('returns null for empty, null, or zero intervals', () => {
    expect(computeOrderGapsTakeaway(null)).toBeNull();
    expect(computeOrderGapsTakeaway(undefined)).toBeNull();
    expect(computeOrderGapsTakeaway([])).toBeNull();
    expect(computeOrderGapsTakeaway([{ days: 2, orders: 0 }])).toBeNull();
  });
});

describe('computeDestinationsTakeaway', () => {
  it('formats top destination with city, spend, orders and percentage of total spend', () => {
    const data = [
      { label: 'Home', city: 'Bangalore', orders: 32, spend: 18400, fee: 350 },
      { label: 'Office', city: 'Bangalore', orders: 20, spend: 11600, fee: 200 },
      { label: 'Parents', city: 'Mysore', orders: 12, spend: 8333, fee: 150 },
    ];
    // Total spend = 18400 + 11600 + 8333 = 38333. 18400 / 38333 = 48.00% -> 48%
    expect(computeDestinationsTakeaway(data)).toBe(
      'Top destination is Home (Bangalore) with ₹18,400 across 32 orders (48% of total spend)',
    );
  });

  it('handles singular order correctly', () => {
    const data = [
      { label: 'Home', city: 'Mumbai', orders: 1, spend: 450, fee: 30 },
    ];
    expect(computeDestinationsTakeaway(data)).toBe(
      'Top destination is Home (Mumbai) with ₹450 across 1 order (100% of total spend)',
    );
  });

  it('avoids duplicating city if destination label already includes it or city is missing', () => {
    const withCityInLabel = [
      { label: 'Bangalore Central', city: 'Bangalore', orders: 10, spend: 5000, fee: 100 },
    ];
    expect(computeDestinationsTakeaway(withCityInLabel)).toBe(
      'Top destination is Bangalore Central with ₹5,000 across 10 orders (100% of total spend)',
    );

    const withoutCity = [
      { label: 'Apartment 4B', city: '', orders: 5, spend: 2500, fee: 50 },
    ];
    expect(computeDestinationsTakeaway(withoutCity)).toBe(
      'Top destination is Apartment 4B with ₹2,500 across 5 orders (100% of total spend)',
    );
  });

  it('aggregates duplicate destination entries with same label and city', () => {
    const data = [
      { label: 'Home', city: 'Bangalore', orders: 12, spend: 6000, fee: 100 },
      { label: 'Home', city: 'Bangalore', orders: 20, spend: 12400, fee: 250 },
      { label: 'Office', city: 'Bangalore', orders: 10, spend: 8000, fee: 120 },
    ];
    // Aggregated Home: 32 orders, 18400 spend. Total spend = 26400. 18400 / 26400 = 69.69% -> 70%
    expect(computeDestinationsTakeaway(data)).toBe(
      'Top destination is Home (Bangalore) with ₹18,400 across 32 orders (70% of total spend)',
    );
  });

  it('returns null for missing, empty, or all-zero data', () => {
    expect(computeDestinationsTakeaway(null)).toBeNull();
    expect(computeDestinationsTakeaway(undefined)).toBeNull();
    expect(computeDestinationsTakeaway([])).toBeNull();
    expect(computeDestinationsTakeaway([{ label: 'Home', city: 'Blr', orders: 0, spend: 0 }])).toBeNull();
  });

  it('returns null on tied top destinations', () => {
    const tied = [
      { label: 'Home', city: 'Bangalore', orders: 10, spend: 5000, fee: 50 },
      { label: 'Office', city: 'Bangalore', orders: 10, spend: 5000, fee: 50 },
    ];
    expect(computeDestinationsTakeaway(tied)).toBeNull();
  });
});

describe('computeDistanceVsFeeTakeaway', () => {
  it('formats mean fee, mean distance, and trend slope per km', () => {
    // 3 points: (2.0 km, ₹20), (4.0 km, ₹30), (6.0 km, ₹40)
    // Mean dist = 4.0 km, Mean fee = ₹30
    // Slope = (40 - 20) / (6 - 2) = 5.00
    const data = [
      { distance_km: 2.0, fee: 20 },
      { distance_km: 4.0, fee: 30 },
      { distance_km: 6.0, fee: 40 },
    ];
    expect(computeDistanceVsFeeTakeaway(data)).toBe(
      'Average delivery fee is ₹30 across 4.0 km mean distance (~₹5.00/km trend)'
    );
  });

  it('correctly matches brief example values (₹34 across 4.2 km with ~₹5.20/km trend)', () => {
    // We construct points where mean fee ~ ₹34, mean distance ~ 4.2 km, slope ~ 5.20
    const data = [
      { distance_km: 2.2, fee: 23.6 },
      { distance_km: 4.2, fee: 34.0 },
      { distance_km: 6.2, fee: 44.4 },
    ];
    // Mean dist: (2.2 + 4.2 + 6.2)/3 = 4.2 km
    // Mean fee: (23.6 + 34.0 + 44.4)/3 = 34.0 -> ₹34
    // Slope: (44.4 - 23.6) / (6.2 - 2.2) = 20.8 / 4 = 5.20
    expect(computeDistanceVsFeeTakeaway(data)).toBe(
      'Average delivery fee is ₹34 across 4.2 km mean distance (~₹5.20/km trend)'
    );
  });

  it('formats negative slope correctly when longer distance has lower fee', () => {
    const data = [
      { distance_km: 2.0, fee: 50 },
      { distance_km: 6.0, fee: 40 },
    ];
    // Mean dist: 4.0 km, Mean fee: ₹45
    // Slope: -10 / 4 = -2.50
    expect(computeDistanceVsFeeTakeaway(data)).toBe(
      'Average delivery fee is ₹45 across 4.0 km mean distance (~-₹2.50/km trend)'
    );
  });

  it('omits trendline slope when only 1 valid point exists', () => {
    const data = [{ distance_km: 3.5, fee: 45 }];
    expect(computeDistanceVsFeeTakeaway(data)).toBe(
      'Average delivery fee is ₹45 across 3.5 km mean distance'
    );
  });

  it('omits trendline slope when all distances are identical (zero denominator)', () => {
    const data = [
      { distance_km: 5.0, fee: 30 },
      { distance_km: 5.0, fee: 50 },
    ];
    expect(computeDistanceVsFeeTakeaway(data)).toBe(
      'Average delivery fee is ₹40 across 5.0 km mean distance'
    );
  });

  it('returns null when distance_unavailable_reason is provided', () => {
    const data = [
      { distance_km: 2.0, fee: 20 },
      { distance_km: 4.0, fee: 30 },
    ];
    expect(
      computeDistanceVsFeeTakeaway(
        data,
        'More than 80% of delivered orders lack valid coordinates.'
      )
    ).toBeNull();
  });

  it('returns null for missing, empty, or all-zero data', () => {
    expect(computeDistanceVsFeeTakeaway(null)).toBeNull();
    expect(computeDistanceVsFeeTakeaway(undefined)).toBeNull();
    expect(computeDistanceVsFeeTakeaway([])).toBeNull();
    expect(computeDistanceVsFeeTakeaway([{ distance_km: 0, fee: 0 }])).toBeNull();
  });

  it('filters out invalid or negative numbers', () => {
    const data = [
      { distance_km: 2.0, fee: 20 },
      { distance_km: 4.0, fee: 30 },
      { distance_km: -5, fee: 20 },
      { distance_km: Number.NaN, fee: 30 },
      { distance_km: 3.0, fee: -10 },
      { distance_km: 3.0, fee: Number.NaN },
    ];
    expect(computeDistanceVsFeeTakeaway(data)).toBe(
      'Average delivery fee is ₹25 across 3.0 km mean distance (~₹5.00/km trend)'
    );
  });
});

