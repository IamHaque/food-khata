import {it,expect,vi,afterEach} from 'vitest';
import {csvCell,exportLedger} from './ledger';
import {orders} from './api';
import {defaultFilters} from './filters';
vi.mock('./api',()=>({orders:vi.fn()}));
afterEach(()=>vi.clearAllMocks());
it('escapes CSV quotes, newlines and spreadsheet formulas',()=>{
 expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
 expect(csvCell(' =HYPERLINK("bad")')).toBe('"\' =HYPERLINK(""bad"")"');
});
it('loads all server pages and preserves scope',async()=>{
 const row={id:'one',account_label:'••••0001',account_id:'fake',platform_order_id:'fake-1',order_timestamp:'2025-01-01T12:00:00',order_time:'12:00:00',payment_method:'UPI',user_rating:null,food_discount:0,delivery_fee_discount:0,other_charges:0,source_complete:true,reconciliation_difference:0,platform:'SWIGGY',order_date:'2025-01-01',order_status:'DELIVERED',restaurant_name:'Fictional',address_label:null,city:null,items_summary:'Lunch',final_amount_paid:10,item_subtotal:10,total_discount:0,reported_savings:0,delivery_fee:0,packaging_fee:0,platform_fee:0,total_tax:0,tip:0,refund_amount:0,financial_verified:true};
 const response={filters_applied:defaultFilters(),generated_at:'now',rows:[row],total:2,page:1,page_size:200,filtered_total_amount:20};
 vi.mocked(orders).mockResolvedValueOnce(response).mockResolvedValueOnce({...response,page:2,rows:[{...row,id:'two',platform_order_id:'fake-2'}]});
 const csv=await exportLedger({account_ids:['fake'],statuses:[]},new AbortController().signal);
 expect(csv).toContain('fake-1');expect(csv).toContain('fake-2');
 expect(vi.mocked(orders).mock.calls[1][0]).toMatchObject({account_ids:['fake'],statuses:[],page:2,page_size:200});
});
it('does not start an aborted export',async()=>{
 const controller=new AbortController();controller.abort();
 await expect(exportLedger({},controller.signal)).rejects.toThrow();expect(orders).not.toHaveBeenCalled();
});
