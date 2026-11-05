import {chromium} from '@playwright/test';
import {preview} from 'vite';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const filters={date_from:null,date_to:null,account_ids:[],platforms:[],statuses:['DELIVERED'],cities:[],localities:[],restaurant_ids:[],cuisines:[],veg:'all',payment_methods:[],amount_min:null,amount_max:null,meal_slots:[],day_type:'all',verified_only:false,search:null,compare:'none'};
const accounts=[{id:'fake-a',label:'••••0001',platforms:['ZOMATO','SWIGGY'],order_count:20,date_from:'2025-01-01',date_to:'2026-01-01'},{id:'fake-b',label:'••••0002',platforms:['SWIGGY'],order_count:10,date_from:'2025-01-01',date_to:'2026-01-01'}];
let server,browser;
try{
 server=await preview({root,preview:{host:'127.0.0.1',port:0,open:false}});const url=server.resolvedUrls.local[0];
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 const context=await browser.newContext({viewport:{width:360,height:900}});const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===new URL(url).origin&&(u.pathname==='/'||u.pathname==='/ledger'||u.pathname.startsWith('/assets/'))?route.continue():route.abort();});
 let single=false;
 await page.route('**/api/**',route=>{const u=new URL(route.request().url());const scope=u.searchParams.getAll('account_ids');const current={...filters,account_ids:scope};
 if(u.pathname==='/api/meta/filters')return route.fulfill({json:{filters_applied:current,generated_at:'now',accounts:accounts.filter(a=>!scope.length||scope.includes(a.id)),all_accounts:single?accounts.slice(0,1):accounts,restaurants:scope[0]==='fake-a'?[{id:'r-a',name:'Fictional A'}]:[{id:'r-a',name:'Fictional A'},{id:'r-b',name:'Fictional B'}],platforms:['SWIGGY','ZOMATO'],statuses:['DELIVERED','CANCELLED'],cities:['Imaginary'],localities:[],cuisines:['Meals'],payment_methods:['UPI'],date_from:'2025-01-01',date_to:'2026-01-01',amount_min:0,amount_max:1000}});
 if(u.pathname==='/api/orders') {
 const all=Array.from({length:65},(_,i)=>({id:String(i),account_label:'Masked fake',account_id:i<60?'fake-a':'fake-b',platform_order_id:'fake-'+i,order_timestamp:'2025-01-01T12:00:00',order_time:'12:00:00',payment_method:'UPI',user_rating:null,food_discount:0,delivery_fee_discount:0,other_charges:0,source_complete:true,reconciliation_difference:0,platform:'SWIGGY',order_date:'2025-01-01',order_status:i===1?'CANCELLED':'DELIVERED',restaurant_name:'Fictional Restaurant '+i,address_label:null,city:null,items_summary:'Lunch',final_amount_paid:100+i,item_subtotal:100+i,total_discount:0,reported_savings:0,delivery_fee:0,packaging_fee:0,platform_fee:0,total_tax:0,tip:0,refund_amount:0,financial_verified:i!==1}));
 const statuses=u.searchParams.getAll('statuses').filter(Boolean);
 const filtered=all.filter(o=>(!scope.length||scope.includes(o.account_id))&&(!statuses.length||statuses.includes(o.order_status)));
 if(u.searchParams.get('sort')==='amount')filtered.sort((a,b)=>(a.final_amount_paid-b.final_amount_paid)*(u.searchParams.get('direction')==='asc'?1:-1));
 const pageNumber=Number(u.searchParams.get('page')??1),size=Number(u.searchParams.get('page_size')??50);
 return route.fulfill({json:{filters_applied:{...current,statuses},generated_at:'now',rows:filtered.slice((pageNumber-1)*size,pageNumber*size),total:filtered.length,page:pageNumber,page_size:size,filtered_total_amount:filtered.reduce((n,o)=>n+o.final_amount_paid,0)}});
 }
 if(u.pathname==='/api/meta/data-health')return route.fulfill({json:{filters_applied:current,generated_at:'now',imports:[],history_complete:true,details_complete:true,verified_percent:100,null_rates:{},duplicate_orders:0,reconciliation_anomalies:0,note:'Synthetic'}});
 return route.abort();});
 await page.goto(url+'?restaurant_ids=r-b&search=noodles'); 
 await page.getByLabel('Account',{exact:true}).selectOption('fake-a');
 await page.getByText('Removed unavailable filters: restaurant_ids',{exact:true}).waitFor();
 assert.equal(new URL(page.url()).searchParams.has('restaurant_ids'),false);
 assert.equal(await page.getByLabel('Search restaurant or item',{exact:true}).inputValue(),'noodles');
 await page.reload();await page.getByLabel('Account',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('Account',{exact:true}).inputValue(),'fake-a');
 assert.equal(await page.getByLabel('Search restaurant or item',{exact:true}).inputValue(),'noodles');
 await page.getByRole('button',{name:'Save preset',exact:true}).click();
 await page.getByLabel('Search restaurant or item',{exact:true}).fill('rice');
 await page.getByRole('button',{name:'Load preset',exact:true}).click();
 assert.equal(await page.getByLabel('Search restaurant or item',{exact:true}).inputValue(),'noodles');
 await page.getByLabel('Theme',{exact:true}).selectOption('dark');
 assert.equal(await page.locator('html').getAttribute('data-v2theme'),'dark');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile page overflow');
 single=true;await page.reload();await page.getByText(/Account: ••••0001/).waitFor();
 assert.equal(await page.getByLabel('Account',{exact:true}).count(),0);
 single=false;await page.goto(url+'ledger');
 await page.locator('tbody tr').first().waitFor();
 assert.equal(await page.locator('tbody tr').count(),50);
 assert.equal(new URL(page.url()).searchParams.get('statuses'),'');
 await Promise.all([page.waitForResponse(r=>r.url().includes('/api/orders?')&&r.url().includes('sort=amount')),page.getByRole('button',{name:'Amount',exact:true}).click()]);
 assert.ok((await page.locator('th[aria-sort=descending]').innerText()).includes('Amount'));
 await Promise.all([page.waitForResponse(r=>r.url().includes('/api/orders?')&&r.url().includes('page=2')),page.getByRole('button',{name:'Next page',exact:true}).click()]);
 assert.equal(await page.locator('tbody tr').count(),15);
 await Promise.all([page.waitForResponse(r=>r.url().includes('/api/orders?')&&r.url().includes('page_size=25')),page.getByLabel('Rows per page',{exact:true}).selectOption('25')]);
 assert.equal(await page.locator('tbody tr').count(),25);
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Export CSV',exact:true}).click()]);
 const stream=await download.createReadStream();let csv='';for await(const chunk of stream)csv+=chunk.toString();
 assert.ok(csv.includes('fake-64'));assert.equal(csv.split('\r\n').length,66);
 await page.locator('tbody tr').first().focus();await page.keyboard.press('Enter');
 assert.ok(new URL(page.url()).searchParams.has('order'));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'ledger page overflow');
 assert.deepEqual(errors,[]);
 console.log('Synthetic foundation checks passed: scoped pruning, reload, presets, theme, single account, Ledger sort/pagination/CSV/keyboard and mobile containment.');
}finally{if(browser)await browser.close();if(server)await new Promise(done=>server.httpServer.close(done));}



