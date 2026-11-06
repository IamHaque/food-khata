import { z } from 'zod';
import type { components } from '../types/api';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
 const parsed = new Date(`${value}T00:00:00Z`);
 return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
});
const schema = z.object({
 date_from:date.nullable().default(null),date_to:date.nullable().default(null),
 account_ids:z.array(z.string()).default([]),platforms:z.array(z.string()).default([]),
 statuses:z.array(z.string()).default(['DELIVERED']),cities:z.array(z.string()).default([]),
 localities:z.array(z.string()).default([]),restaurant_ids:z.array(z.string()).default([]),
 cuisines:z.array(z.string()).default([]),payment_methods:z.array(z.string()).default([]),
 veg:z.enum(['all','veg','nonveg','unknown']).default('all'),
 amount_min:z.number().nullable().default(null),amount_max:z.number().nullable().default(null),
 meal_slots:z.array(z.enum(['breakfast','lunch','snack','dinner','late_night'])).default([]),
 day_type:z.enum(['all','weekday','weekend']).default('all'),anomaly:z.enum(['all','review']).default('all'),verified_only:z.boolean().default(false),
 search:z.string().nullable().default(null),compare:z.enum(['none','previous_period','previous_year']).default('none'),
}).refine(f => !f.date_from || !f.date_to || f.date_from <= f.date_to)
 .refine(f => f.amount_min === null || f.amount_max === null || f.amount_min <= f.amount_max);
export type FilterState = z.infer<typeof schema>;
export const defaultFilters = ():FilterState => schema.parse({});
export function parseFilters(params:URLSearchParams):FilterState {
 const values:Record<string,unknown>={};
 for(const key of Object.keys(defaultFilters())) {
  if(!params.has(key)) continue;
  const value=params.get(key) ?? '';
  if(['account_ids','platforms','statuses','cities','localities','restaurant_ids','cuisines','payment_methods','meal_slots'].includes(key)) values[key]=params.getAll(key).filter(Boolean);
  else if(key==='verified_only') values[key]=value==='true';
  else if(key==='amount_min'||key==='amount_max') values[key]=value===''?null:Number(value);
  else values[key]=value || null;
 }
 const result=schema.safeParse(values);
 return result.success?result.data:defaultFilters();
}
export function serializeFilters(filters:FilterState, previous=new URLSearchParams(), resetPage=false):URLSearchParams {
 const valid=schema.parse(filters);
 const params=new URLSearchParams(previous);
 for(const [key,value] of Object.entries(valid)) {
  params.delete(key);
  if(key==="statuses" && Array.isArray(value) && value.join()==="DELIVERED" && !previous.has(key)) continue;
  if(Array.isArray(value)) { if(key==='statuses' && !value.length) params.append(key,''); for(const item of value) params.append(key,item); }
  else if(value!==null) params.set(key,String(value));
 }
 if(resetPage) params.set('page','1');
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


