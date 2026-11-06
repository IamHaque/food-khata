import { expect,it } from 'vitest';
import {defaultFilters,parseFilters,serializeFilters,sanitizeAccountFilters,calculatePresetDates,detectPreset} from './filters';
it('roundtrips all-status scope and preserves unrelated URL state',()=>{
 const f={...defaultFilters(),statuses:[],platforms:['ZOMATO','SWIGGY'],amount_min:0,search:'rice & beans'};
 const p=serializeFilters(f,new URLSearchParams('order=one&sort=amount&page=4'),true);
 expect(parseFilters(p)).toEqual(f);expect(p.get('order')).toBe('one');expect(p.get('page')).toBe('1');
 expect(parseFilters(new URLSearchParams()).statuses).toEqual(['DELIVERED']);
});
it('rejects impossible dates, nonfinite amounts and reversed bounds',()=>{
 for(const q of ['date_from=2025-02-30','amount_min=Infinity','amount_min=3&amount_max=1']) expect(parseFilters(new URLSearchParams(q))).toEqual(defaultFilters());
});
it('drops unavailable account options without dropping dates or search',()=>{
 const f={...defaultFilters(),restaurant_ids:['r1','r2'],platforms:['A','B'],date_from:'2025-01-01',search:'noodles'};
 const result=sanitizeAccountFilters(f,{filters_applied:f,generated_at:'now',accounts:[],all_accounts:[],restaurants:[{id:'r1',name:'Fake'}],platforms:['A'],statuses:['DELIVERED'],cities:[],localities:[],cuisines:[],payment_methods:[],date_from:null,date_to:null,amount_min:null,amount_max:null});
 expect(result.filters.restaurant_ids).toEqual(['r1']);expect(result.filters.platforms).toEqual(['A']);
 expect(result.filters.search).toBe('noodles');expect(result.filters.date_from).toBe('2025-01-01');
 expect(result.removed).toEqual(['platforms','restaurant_ids']);
});

it('preserves implicit versus explicitly selected delivered status',()=>{
 const f={...defaultFilters(),search:'rice'};
 expect(serializeFilters(f).has('statuses')).toBe(false);
 expect(serializeFilters(f,new URLSearchParams('statuses=DELIVERED')).get('statuses')).toBe('DELIVERED');
});

it("round trips the shared anomaly scope",()=>{const f={...defaultFilters(),anomaly:"review" as const};expect(parseFilters(serializeFilters(f)).anomaly).toBe("review");});
 
it('calculates and detects presets accurately', () => {
  const fixedDate = new Date('2026-11-06T12:00:00Z');
  const d7 = calculatePresetDates('7d', fixedDate);
  expect(detectPreset(d7.date_from, d7.date_to, fixedDate)).toBe('7d');
  const d30 = calculatePresetDates('30d', fixedDate);
  expect(detectPreset(d30.date_from, d30.date_to, fixedDate)).toBe('30d');
  const month = calculatePresetDates('month', fixedDate);
  expect(detectPreset(month.date_from, month.date_to, fixedDate)).toBe('month');
  expect(detectPreset(null, null, fixedDate)).toBe('all');
  expect(detectPreset('2025-01-01', '2025-01-10', fixedDate)).toBe('custom');
});
