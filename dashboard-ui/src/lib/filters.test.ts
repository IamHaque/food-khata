import { expect,it } from 'vitest';
import {defaultFilters,parseFilters,serializeFilters,sanitizeAccountFilters} from './filters';
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
