import { describe, expect, it } from 'vitest';
import {
  defaultFilters,
  parseFilters,
  serializeFilters,
  sanitizeAccountFilters,
  calculatePresetDates,
  detectPreset,
  hasActiveFilters,
  type FilterState,
} from './filters';

describe('FilterState parse and serialize round-trip (S-015)', () => {
  it('round-trips a fully specified filter state with every field', () => {
    const full: FilterState = {
      account_ids: ['acc_1', 'acc_2'],
      platforms: ['SWIGGY', 'ZOMATO'],
      statuses: ['DELIVERED', 'CANCELLED'],
      cities: ['Bengaluru', 'Mumbai'],
      localities: ['Koramangala', 'Bandra'],
      restaurant_ids: ['rest_1', 'rest_2'],
      cuisines: ['South Indian', 'Mughlai'],
      payment_methods: ['UPI', 'CREDIT_CARD'],
      meal_slots: ['breakfast', 'lunch', 'snack', 'dinner', 'late_night'],
      date_from: '2025-01-01',
      date_to: '2025-01-31',
      veg: 'veg',
      amount_min: 150,
      amount_max: 750,
      day_type: 'weekend',
      anomaly: 'review',
      verified_only: true,
      search: 'butter chicken & garlic naan',
      compare: 'previous_period',
    };
    const serialized = serializeFilters(full);
    const parsed = parseFilters(serialized);
    expect(parsed).toEqual(full);
  });

  it('round-trips default filters', () => {
    const def = defaultFilters();
    const serialized = serializeFilters(def);
    const parsed = parseFilters(serialized);
    expect(parsed).toEqual(def);
  });

  it('round-trips every multi-value field individually', () => {
    const multiFields: (keyof FilterState)[] = [
      'account_ids',
      'platforms',
      'statuses',
      'cities',
      'localities',
      'restaurant_ids',
      'cuisines',
      'payment_methods',
      'meal_slots',
    ];

    for (const field of multiFields) {
      let testValues: string[];
      if (field === 'meal_slots') {
        testValues = ['lunch', 'dinner'];
      } else if (field === 'statuses') {
        testValues = ['CANCELLED', 'REFUNDED'];
      } else {
        testValues = ['item_alpha', 'item_beta'];
      }

      const state: FilterState = {
        ...defaultFilters(),
        [field]: testValues,
      };

      const serialized = serializeFilters(state);
      const parsed = parseFilters(serialized);
      expect(parsed[field]).toEqual(testValues);
    }
  });

  it('round-trips all enum variants for veg, day_type, anomaly, and compare', () => {
    for (const veg of ['all', 'veg', 'nonveg', 'unknown'] as const) {
      const state = { ...defaultFilters(), veg };
      expect(parseFilters(serializeFilters(state)).veg).toBe(veg);
    }
    for (const day_type of ['all', 'weekday', 'weekend'] as const) {
      const state = { ...defaultFilters(), day_type };
      expect(parseFilters(serializeFilters(state)).day_type).toBe(day_type);
    }
    for (const anomaly of ['all', 'review'] as const) {
      const state = { ...defaultFilters(), anomaly };
      expect(parseFilters(serializeFilters(state)).anomaly).toBe(anomaly);
    }
    for (const compare of ['none', 'previous_period', 'previous_year'] as const) {
      const state = { ...defaultFilters(), compare };
      expect(parseFilters(serializeFilters(state)).compare).toBe(compare);
    }
  });

  it('round-trips scalar fields: zero amount, decimal amounts, boolean toggle', () => {
    const zeroState = { ...defaultFilters(), amount_min: 0, amount_max: 0 };
    expect(parseFilters(serializeFilters(zeroState))).toEqual(zeroState);

    const decimalState = { ...defaultFilters(), amount_min: 49.5, amount_max: 199.99 };
    expect(parseFilters(serializeFilters(decimalState))).toEqual(decimalState);

    const boolState = { ...defaultFilters(), verified_only: true };
    expect(parseFilters(serializeFilters(boolState)).verified_only).toBe(true);

    const boolFalseState = { ...defaultFilters(), verified_only: false };
    expect(parseFilters(serializeFilters(boolFalseState)).verified_only).toBe(false);
  });
});

describe('Malformed and corrupted query handling (S-015)', () => {
  it('falls back to defaults for impossible dates', () => {
    const badDates = [
      'date_from=2025-02-30',
      'date_to=2025-04-31',
      'date_from=2025-13-45',
      'date_to=2025-00-10',
      'date_from=2025-02-29', // 2025 is not a leap year
      'date_to=2023-02-29',
    ];
    for (const q of badDates) {
      expect(parseFilters(new URLSearchParams(q))).toEqual(defaultFilters());
    }
  });

  it('falls back to defaults for invalid date formats', () => {
    const badFormats = [
      'date_from=2025/01/01',
      'date_from=01-01-2025',
      'date_from=not-a-date',
      'date_to=2025-1-1',
      'date_from=2025-01-01T00:00:00Z',
    ];
    for (const q of badFormats) {
      expect(parseFilters(new URLSearchParams(q))).toEqual(defaultFilters());
    }
  });

  it('falls back to defaults for reversed date range (from > to)', () => {
    const reversed = [
      'date_from=2025-05-10&date_to=2025-05-01',
      'date_from=2025-12-31&date_to=2025-01-01',
    ];
    for (const q of reversed) {
      expect(parseFilters(new URLSearchParams(q))).toEqual(defaultFilters());
    }
  });

  it('falls back to defaults for reversed amounts (min > max)', () => {
    const reversed = [
      'amount_min=3&amount_max=1',
      'amount_min=500&amount_max=100',
      'amount_min=10.5&amount_max=10.4',
    ];
    for (const q of reversed) {
      expect(parseFilters(new URLSearchParams(q))).toEqual(defaultFilters());
    }
  });

  it('falls back to defaults for non-numeric amounts', () => {
    const badAmounts = [
      'amount_min=abc',
      'amount_max=xyz',
      'amount_min=10px',
      'amount_max=$50',
      'amount_min=--5',
    ];
    for (const q of badAmounts) {
      expect(parseFilters(new URLSearchParams(q))).toEqual(defaultFilters());
    }
  });

  it('falls back to defaults for NaN and Infinity amounts', () => {
    const nonFinite = [
      'amount_min=NaN',
      'amount_max=NaN',
      'amount_min=Infinity',
      'amount_max=Infinity',
      'amount_min=-Infinity',
      'amount_max=-Infinity',
    ];
    for (const q of nonFinite) {
      expect(parseFilters(new URLSearchParams(q))).toEqual(defaultFilters());
    }
  });

  it('falls back to defaults for unknown enum values', () => {
    const badEnums = [
      'veg=carnivore',
      'veg=fish',
      'day_type=sunday',
      'day_type=weekdayz',
      'anomaly=critical',
      'compare=yearly',
      'compare=super',
      'meal_slots=brunch',
      'meal_slots=midnight_snack',
    ];
    for (const q of badEnums) {
      expect(parseFilters(new URLSearchParams(q))).toEqual(defaultFilters());
    }
  });

  it('falls back to defaults for empty values and invalid booleans', () => {
    const emptyAndInvalid = [
      'date_from=',
      'date_to=',
      'amount_min=',
      'amount_max=',
      'amount_min=%20%20',
      'veg=',
      'day_type=',
      'anomaly=',
      'compare=',
      'verified_only=',
      'verified_only=yes',
      'verified_only=no',
      'verified_only=1',
      'verified_only=0',
      'verified_only=TRUE',
      'verified_only=maybe',
      'platforms=',
      'meal_slots=',
    ];
    for (const q of emptyAndInvalid) {
      expect(parseFilters(new URLSearchParams(q))).toEqual(defaultFilters());
    }
  });
});

describe('URL query parameters preservation and status behavior (S-015)', () => {
  it('preserves unrelated URL parameters across serialization', () => {
    const filters = {
      ...defaultFilters(),
      platforms: ['SWIGGY'],
      amount_min: 50,
      search: 'biryani',
    };
    const previous = new URLSearchParams('order=one&sort=amount&direction=desc&page=4&tab=details');

    const withoutReset = serializeFilters(filters, previous, false);
    expect(withoutReset.get('order')).toBe('one');
    expect(withoutReset.get('sort')).toBe('amount');
    expect(withoutReset.get('direction')).toBe('desc');
    expect(withoutReset.get('page')).toBe('4');
    expect(withoutReset.get('tab')).toBe('details');

    const withReset = serializeFilters(filters, previous, true);
    expect(withReset.get('order')).toBe('one');
    expect(withReset.get('sort')).toBe('amount');
    expect(withReset.get('page')).toBe('1');
    expect(withReset.get('tab')).toBe('details');

    expect(parseFilters(withReset)).toEqual(filters);
  });

  it('handles default status vs explicitly empty statuses array', () => {
    // Missing statuses in URL falls back to default ['DELIVERED']
    expect(parseFilters(new URLSearchParams()).statuses).toEqual(['DELIVERED']);

    // Explicitly empty status param represents all statuses
    const allStatusesState = { ...defaultFilters(), statuses: [] };
    const serialized = serializeFilters(allStatusesState);
    expect(serialized.has('statuses')).toBe(true);
    expect(serialized.get('statuses')).toBe('');
    expect(parseFilters(serialized).statuses).toEqual([]);

    // Explicit DELIVERED status
    const explicitDelivered = serializeFilters(defaultFilters(), new URLSearchParams('statuses=DELIVERED'));
    expect(explicitDelivered.get('statuses')).toBe('DELIVERED');
    expect(parseFilters(explicitDelivered).statuses).toEqual(['DELIVERED']);
  });
});

describe('Preset dates calculation and detection (S-015)', () => {
  it('calculates and detects presets accurately', () => {
    const fixedDate = new Date('2026-11-06T12:00:00Z');
    for (const preset of ['7d', '30d', '90d', 'month', 'last_month', 'year', 'fy']) {
      const dates = calculatePresetDates(preset, fixedDate);
      expect(detectPreset(dates.date_from, dates.date_to, fixedDate)).toBe(preset);
    }
    expect(detectPreset(null, null, fixedDate)).toBe('all');
    expect(detectPreset('2025-01-01', '2025-01-10', fixedDate)).toBe('custom');
  });

  it('detectPreset returns custom when only one date bound is present', () => {
    const fixedDate = new Date('2026-11-06T12:00:00Z');
    expect(detectPreset('2025-01-01', null, fixedDate)).toBe('custom');
    expect(detectPreset(null, '2025-01-10', fixedDate)).toBe('custom');
  });
});

describe('hasActiveFilters helper (S-015)', () => {
  it('detects default vs active filters', () => {
    expect(hasActiveFilters(defaultFilters())).toBe(false);
    expect(hasActiveFilters({ ...defaultFilters(), platforms: ['SWIGGY'] })).toBe(true);
    expect(hasActiveFilters({ ...defaultFilters(), statuses: [] })).toBe(true);
    expect(hasActiveFilters({ ...defaultFilters(), amount_min: 0 })).toBe(true);
    expect(hasActiveFilters({ ...defaultFilters(), veg: 'veg' })).toBe(true);
    expect(hasActiveFilters({ ...defaultFilters(), verified_only: true })).toBe(true);
    expect(hasActiveFilters({ ...defaultFilters(), search: 'tea' })).toBe(true);
    expect(hasActiveFilters({ ...defaultFilters(), compare: 'previous_period' })).toBe(true);
    expect(hasActiveFilters({ ...defaultFilters(), meal_slots: ['dinner'] })).toBe(true);
  });
});

describe('Account filters sanitization (S-015)', () => {
  it('drops unavailable account options without dropping dates or search', () => {
    const f = {
      ...defaultFilters(),
      restaurant_ids: ['r1', 'r2'],
      platforms: ['A', 'B'],
      date_from: '2025-01-01',
      search: 'noodles',
    };
    const result = sanitizeAccountFilters(f, {
      filters_applied: f,
      generated_at: 'now',
      accounts: [],
      all_accounts: [],
      restaurants: [{ id: 'r1', name: 'Fake' }],
      platforms: ['A'],
      statuses: ['DELIVERED'],
      cities: [],
      localities: [],
      cuisines: [],
      payment_methods: [],
      date_from: null,
      date_to: null,
      amount_min: null,
      amount_max: null,
    });
    expect(result.filters.restaurant_ids).toEqual(['r1']);
    expect(result.filters.platforms).toEqual(['A']);
    expect(result.filters.search).toBe('noodles');
    expect(result.filters.date_from).toBe('2025-01-01');
    expect(result.removed).toEqual(['platforms', 'restaurant_ids']);
  });
});
