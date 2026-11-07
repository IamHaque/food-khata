import { describe, expect, it } from 'vitest';
import {
 computeDayTypeTakeaway,
 computeMealSlotTakeaway,
 computePlatformTakeaway,
 computeSpendTrendTakeaway,
 computeTopRestaurantTakeaway,
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
