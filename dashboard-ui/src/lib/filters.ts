import { z } from 'zod';
import type { components } from '../types/api';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
 const parsed = new Date(`${value}T00:00:00Z`);
 return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
});
const schema = z.object({
  date_from: date.nullable().default(null),
  date_to: date.nullable().default(null),
  account_ids: z.array(z.string().min(1)).default([]),
  platforms: z.array(z.string().min(1)).default([]),
  statuses: z.array(z.string().min(1)).default(['DELIVERED']),
  cities: z.array(z.string().min(1)).default([]),
  localities: z.array(z.string().min(1)).default([]),
  restaurant_ids: z.array(z.string().min(1)).default([]),
  cuisines: z.array(z.string().min(1)).default([]),
  payment_methods: z.array(z.string().min(1)).default([]),
  veg: z.enum(['all', 'veg', 'nonveg', 'unknown']).default('all'),
  amount_min: z.number().finite().nullable().default(null),
  amount_max: z.number().finite().nullable().default(null),
  meal_slots: z.array(z.enum(['breakfast', 'lunch', 'snack', 'dinner', 'late_night'])).default([]),
  day_type: z.enum(['all', 'weekday', 'weekend']).default('all'),
  anomaly: z.enum(['all', 'review']).default('all'),
  verified_only: z.boolean().default(false),
  search: z.string().nullable().default(null),
  compare: z.enum(['none', 'previous_period', 'previous_year']).default('none'),
}).refine(f => !f.date_from || !f.date_to || f.date_from <= f.date_to)
  .refine(f => f.amount_min === null || f.amount_max === null || f.amount_min <= f.amount_max);

export type FilterState = z.infer<typeof schema>;
export const defaultFilters = (): FilterState => schema.parse({});

export function hasActiveFilters(filters: FilterState): boolean {
  const d = defaultFilters();
  return (
    filters.account_ids.length > 0 ||
    filters.platforms.length > 0 ||
    filters.statuses.length !== d.statuses.length ||
    filters.statuses.some((s, i) => s !== d.statuses[i]) ||
    filters.cities.length > 0 ||
    filters.localities.length > 0 ||
    filters.restaurant_ids.length > 0 ||
    filters.cuisines.length > 0 ||
    filters.payment_methods.length > 0 ||
    filters.meal_slots.length > 0 ||
    filters.date_from !== null ||
    filters.date_to !== null ||
    filters.veg !== d.veg ||
    filters.amount_min !== null ||
    filters.amount_max !== null ||
    filters.day_type !== d.day_type ||
    filters.anomaly !== d.anomaly ||
    filters.verified_only !== d.verified_only ||
    filters.search !== null ||
    filters.compare !== d.compare
  );
}

export function parseFilters(params: URLSearchParams): FilterState {
  const values: Record<string, unknown> = {};
  const arrayKeys = [
    'account_ids',
    'platforms',
    'statuses',
    'cities',
    'localities',
    'restaurant_ids',
    'cuisines',
    'payment_methods',
    'meal_slots',
  ] as const;

  for (const key of Object.keys(defaultFilters())) {
    if (!params.has(key)) continue;

    if ((arrayKeys as readonly string[]).includes(key)) {
      if (key === 'statuses') {
        values[key] = params.getAll(key).filter(Boolean);
      } else {
        values[key] = params.getAll(key);
      }
    } else if (key === 'verified_only') {
      const val = params.get(key);
      if (val === 'true') values[key] = true;
      else if (val === 'false') values[key] = false;
      else values[key] = '__invalid_boolean__';
    } else if (key === 'amount_min' || key === 'amount_max') {
      const raw = params.get(key);
      if (raw === null || raw.trim() === '') {
        values[key] = '__invalid_amount__';
      } else {
        const num = Number(raw);
        values[key] = Number.isFinite(num) ? num : '__invalid_number__';
      }
    } else if (key === 'date_from' || key === 'date_to') {
      const raw = params.get(key);
      values[key] = raw;
    } else if (key === 'search') {
      const raw = params.get(key);
      values[key] = raw ? raw : null;
    } else {
      const raw = params.get(key);
      values[key] = raw;
    }
  }

  const result = schema.safeParse(values);
  return result.success ? result.data : defaultFilters();
}

export function serializeFilters(filters: FilterState, previous = new URLSearchParams(), resetPage = false): URLSearchParams {
  const valid = schema.parse(filters);
  const params = new URLSearchParams(previous);
  for (const [key, value] of Object.entries(valid)) {
    params.delete(key);
    if (key === 'statuses' && Array.isArray(value) && value.join() === 'DELIVERED' && !previous.has(key)) continue;
    if (Array.isArray(value)) {
      if (key === 'statuses' && !value.length) params.append(key, '');
      for (const item of value) params.append(key, item);
    } else if (value !== null) {
      params.set(key, String(value));
    }
  }
  if (resetPage) params.set('page', '1');
  return params;
}
export function sanitizeAccountFilters(filters:FilterState, meta:components['schemas']['FilterOptions']) {
 const next={...filters};
 const removed:string[]=[];
 const choices={platforms:meta.platforms,statuses:meta.statuses,cities:meta.cities,localities:meta.localities,
  restaurant_ids:meta.restaurants.map(r=>r.id),cuisines:meta.cuisines,payment_methods:meta.payment_methods};
 for(const key of Object.keys(choices) as (keyof typeof choices)[]) {
  next[key]=filters[key].filter(value=>choices[key].includes(value));
  if(next[key].length!==filters[key].length) removed.push(key);
 }
 // An unavailable explicit status must not silently widen the scope to all statuses.
 if(filters.statuses.length && !next.statuses.length) next.statuses=['DELIVERED'];
 return {filters:next,removed};
}

export function validateFilters(value:unknown):FilterState{return schema.parse(value);}

export function calculatePresetDates(name: string, now = new Date()): { date_from: string | null; date_to: string | null } {
  if (name === 'all' || name === 'custom') return { date_from: null, date_to: null };
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start = new Date(end);
  if (name === '7d' || name === '30d' || name === '90d') {
    start.setDate(start.getDate() - Number(name.slice(0, -1)) + 1);
  } else if (name === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (name === 'last_month') {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end.setDate(0);
  } else if (name === 'year') {
    start = new Date(now.getFullYear(), 0, 1);
  } else if (name === 'fy') {
    start = new Date(now.getFullYear() - (now.getMonth() < 3 ? 1 : 0), 3, 1);
  }
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { date_from: iso(start), date_to: iso(end) };
}

export function detectPreset(date_from: string | null, date_to: string | null, now = new Date()): string {
  if (!date_from && !date_to) return 'all';
  if (!date_from || !date_to) return 'custom';
  for (const p of ['7d', '30d', '90d', 'month', 'last_month', 'fy', 'year']) {
    const dates = calculatePresetDates(p, now);
    if (dates.date_from === date_from && dates.date_to === date_to) return p;
  }
  return 'custom';
}


