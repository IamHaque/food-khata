import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from '@playwright/test';
import {preview} from 'vite';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const filters={date_from:null,date_to:null,account_ids:[],platforms:[],statuses:['DELIVERED'],cities:[],localities:[],restaurant_ids:[],cuisines:[],veg:'all',payment_methods:[],amount_min:null,amount_max:null,meal_slots:[],day_type:'all',verified_only:false,search:null,compare:'none'};
const accounts=[{id:'fake-a',label:'••••0001',platforms:['ZOMATO','SWIGGY'],order_count:20,date_from:'2025-01-01',date_to:'2026-01-01'},{id:'fake-b',label:'••••0002',platforms:['SWIGGY'],order_count:10,date_from:'2025-01-01',date_to:'2026-01-01'}];
function makeOrders(){return Array.from({length:65},(_,i)=>({fees:0,id:String(i),account_label:'Masked fake',account_id:i<60?'fake-a':'fake-b',platform_order_id:'fake-'+i,order_timestamp:'2025-01-01T12:00:00',order_time:'12:00:00',payment_method:'UPI',user_rating:null,food_discount:0,delivery_fee_discount:0,other_charges:0,source_complete:true,reconciliation_difference:0,platform:'SWIGGY',order_date:'2025-01-01',order_status:i===1?'CANCELLED':'DELIVERED',restaurant_name:'Fictional Restaurant '+i,address_label:null,city:null,items_summary:'Lunch',final_amount_paid:100+i,item_subtotal:100+i,total_discount:0,reported_savings:0,delivery_fee:0,packaging_fee:0,platform_fee:0,total_tax:0,tip:0,refund_amount:0,financial_verified:i!==1}));}

let server,browser;
try{
 server=await preview({root,preview:{host:'127.0.0.1',port:0,open:false}});const url=server.resolvedUrls.local[0];
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 const context=await browser.newContext({viewport:{width:360,height:900}});const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===new URL(url).origin&&(['/','/ledger','/spending','/food','/behavior','/places','/data-health'].includes(u.pathname)||u.pathname.startsWith('/assets/'))?route.continue():route.abort();});
 let single=false;
 await page.route('**/api/**',route=>{const u=new URL(route.request().url());const scope=u.searchParams.getAll('account_ids');const current={...filters,account_ids:scope};
 if(u.pathname==='/api/meta/filters')return route.fulfill({json:{filters_applied:current,generated_at:'now',accounts:accounts.filter(a=>!scope.length||scope.includes(a.id)),all_accounts:single?accounts.slice(0,1):accounts,restaurants:scope[0]==='fake-a'?[{id:'r-a',name:'Fictional A'}]:[{id:'r-a',name:'Fictional A'},{id:'r-b',name:'Fictional B'}],platforms:['SWIGGY','ZOMATO'],statuses:['DELIVERED','CANCELLED'],cities:['Imaginary'],localities:[],cuisines:['Meals'],payment_methods:['UPI'],date_from:'2025-01-01',date_to:'2026-01-01',amount_min:0,amount_max:1000}});
 if(u.pathname==='/api/dashboard') {
 const body=route.request().postDataJSON();const statuses=body.statuses??['DELIVERED'];
 const rows=makeOrders().filter(o=>(!body.account_ids?.length||body.account_ids.includes(o.account_id))&&(!statuses.length||statuses.includes(o.order_status)));
 const delivered=rows.filter(o=>o.order_status==='DELIVERED');const spend=delivered.reduce((n,o)=>n+o.final_amount_paid,0);
 return route.fulfill({json:{filters_applied:{...filters,...body},generated_at:'now',data_complete:true,comparison:null,kpis:{orders:rows.length,valid_order_count:delivered.length,spend,aov:delivered.length?spend/delivered.length:null,total_discount:0,reported_savings:0,discount_rate:0,reported_savings_rate:0,fees:0,fee_percentage:0,tax:0,tips:0,refunds:0,unique_restaurants:delivered.length,unique_dishes:1,average_rating:null},charts:{food:{diet_monthly:[{month:'2025-01',veg:5,non_veg:3,unknown:1}],cuisines:[{name:'Fictional cuisine with a very long descriptive name',orders:9,spend}],diet:[{diet:'Veg',item_lines:5,quantity:5,line_total:500}],loyalty:[{key:'fake',name:'Fictional restaurant with a long name that must remain contained',orders:9,spend,aov:100}],new_repeat:[{month:'2025-01',new_orders:1,repeat_orders:8}],cuisine_unavailable_reason:null,diet_unavailable_reason:null,orders_without_dates:0},spending:{discount_breakdown:[{label:'Food discount',amount:100}],daily:[{date:'2025-01-01',spend,cumulative:spend,rolling_30:spend}],years:[{year:2025,month:1,spend}],fee_scatter:[{amount:120,fees:12,fee_percent:10}],unallocated_spend:0},kpi_history:[],waterfall_steps:[{label:'Provider paid',amount:spend,baseline:0,height:spend,direction:'total'}],places:{labels:[{label:'Fictional Home',city:'Imaginary',orders:9,spend,fee:12}],distances:[{distance_km:2,fee:12}],distance_unavailable_reason:null,unsupported_reason:'Maps are not supported.'},behavior:{timing_unavailable_reason:null,date_unavailable_reason:null,hour_weekday:[{key:'12',orders:9,spend}],meals:[{key:'lunch',orders:9,spend}],day_type:[{key:'weekday',orders:9,spend}],aov_histogram:[{key:'100-250',orders:9}],gaps:[{days:1,orders:9}],longest_streak:1,longest_gap:0,orders_per_week:rows.length*7},monthly:[{month:'2025-01',orders:rows.length,spend}],calendar:[{date:'2025-01-01',orders:rows.length,spend}],cost_waterfall:{subtotal:spend,food_discount:0,net_delivery:0,packaging:0,platform:0,tax:0,tip:0,other:0,residual:0,provider_paid:spend,refunds:0},top_restaurants:[],top_dishes:[],platforms:[],monthly_fee_components:[],insights:[]}}});
 }
 if(u.pathname.endsWith('/bill')) {
 const id=decodeURIComponent(u.pathname.split('/')[3]);const order=makeOrders().find(row=>row.id===id);
 if(!order)return route.fulfill({status:404,json:{error:{code:'not_found',message:'Order not found.'}}});
 return route.fulfill({json:{order,items:[{item_name:'Fictional Lunch',quantity:1,unit_price:order.final_amount_paid,total_price:order.final_amount_paid,is_veg:true,category:'Meals'}],discount_items:[],reconciliation_status:'matches',reconciliation_label:'Matches',reconciliation_difference:0,full_address:null,source_bill:{item_total:order.final_amount_paid},discount_breakdown:null}});
 }
 if(u.pathname==='/api/restaurants'||u.pathname==='/api/items')return route.fulfill({json:{filters_applied:current,generated_at:'now',rows:[{key:'fake-leader',name:'Fictional leader',quantity:3,amount:120,price_trend:[{month:'2025-01',unit_price:40,quantity:3}]}],total:1,page:1,page_size:25}});
 if(u.pathname==='/api/orders') {
 const all=makeOrders();
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
 await page.reload();await page.waitForFunction(()=>document.querySelector('[aria-label=Account]')?.value==='fake-a');
 assert.equal(await page.getByLabel('Account',{exact:true}).inputValue(),'fake-a');
 assert.equal(await page.getByLabel('Search restaurant or item',{exact:true}).inputValue(),'noodles');
 await page.getByRole('button',{name:'Save preset',exact:true}).click();
 await page.getByLabel('Search restaurant or item',{exact:true}).fill('rice');
 await page.getByRole('button',{name:'Load preset',exact:true}).click();
 assert.equal(await page.getByLabel('Search restaurant or item',{exact:true}).inputValue(),'noodles');
 await page.getByLabel('Theme',{exact:true}).selectOption('dark');
 assert.ok(await page.evaluate(()=>document.documentElement.classList.contains('dark')),'dark theme');
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
 await page.getByRole('dialog').waitFor();await page.getByText('Fictional Lunch',{exact:true}).waitFor();
 const original=new URL(page.url()).searchParams.get('order');
 await page.getByRole('button',{name:'Next order',exact:true}).click();
 await page.waitForFunction(id=>new URL(location.href).searchParams.get('order')!==id,original);
 await page.getByText('Fictional Lunch',{exact:true}).waitFor();
 await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
 assert.equal(new URL(page.url()).searchParams.has('order'),false);
 assert.equal(await page.locator('tbody tr:focus').count(),1);
 await page.locator('tbody tr').last().click();await page.getByText('fake-40',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Next order',exact:true}).click();await page.getByText('fake-39',{exact:true}).waitFor();
 assert.equal(new URL(page.url()).searchParams.get('page'),'2');
 await page.keyboard.press('ArrowLeft');await page.getByText('fake-40',{exact:true}).waitFor();
 assert.equal(new URL(page.url()).searchParams.get('page'),'1');await page.keyboard.press('Escape');
 await page.goto(url+'ledger?order=0&sort=amount&direction=desc&page_size=25&statuses=');
 await page.getByText('fake-0',{exact:true}).waitFor();await page.getByRole('button',{name:'Previous order',exact:true}).click();
 await page.getByText('fake-1',{exact:true}).waitFor();assert.equal(new URL(page.url()).searchParams.get('page'),'3');
 await page.keyboard.press('Escape');


 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'ledger page overflow');
 for(const [path,title] of [['spending','Spending'],['food','Food'],['behavior','Behavior'],['places','Places'],['data-health','Data health']]){await page.goto(url+path);await page.getByRole('heading',{name:title,exact:true}).waitFor();await page.waitForTimeout(250);assert.equal(await page.getByText('This page is not available yet.').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,path+' overflow');}
 await page.goto(url+'food?account_ids=fake-a');await page.getByRole('heading',{name:'Food',exact:true}).waitFor();await page.getByRole('link',{name:'Spending',exact:true}).click();assert.equal(new URL(page.url()).searchParams.get('account_ids'),'fake-a');
 await page.keyboard.press('Control+k');await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Go to Food',exact:true}).click();await page.getByRole('heading',{name:'Food',exact:true}).waitFor();assert.equal(new URL(page.url()).searchParams.get('account_ids'),'fake-a');await page.getByRole('button',{name:'Fictional leader',exact:true}).click();await page.getByRole('heading',{name:'Unit price history: Fictional leader',exact:true}).waitFor();
 if(process.env.AXE_CORE_PATH){
 const output=resolve(root,'test-results/synthetic-v2');mkdirSync(output,{recursive:true});const results=[];
 for(const theme of ['light','dark'])for(const width of [360,768,1280,1920])for(const path of ['','spending','food','behavior','places','ledger','data-health']){
 await page.setViewportSize({width,height:900});await page.goto(url+path);await page.getByRole('heading',{level:1}).waitFor();await page.getByLabel('Theme',{exact:true}).selectOption(theme);await page.waitForTimeout(300);
 if(path==='ledger'){await page.locator('tbody tr').first().click();await page.getByRole('dialog').waitFor();}
 await page.addScriptTag({path:process.env.AXE_CORE_PATH});const audit=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return {violations:r.violations.map(x=>({id:x.id,impact:x.impact,nodes:x.nodes.map(n=>n.target)})),incomplete:r.incomplete.map(x=>x.id)};});
 results.push({theme,width,page:path||'overview',...audit});await page.screenshot({path:resolve(output,`${path||'overview'}-${theme}-${width}.png`),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,path+' matrix overflow');if(path==='ledger')await page.keyboard.press('Escape');
 }writeFileSync(resolve(output,'accessibility.json'),JSON.stringify(results,null,2));const serious=results.flatMap(r=>r.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>`${r.page}/${r.theme}/${r.width}: ${v.id}`));assert.deepEqual(serious,[]);
 }
 assert.deepEqual(errors,[]);
 console.log('Synthetic foundation checks passed: scoped pruning, reload, presets, theme, single account, Ledger sort/pagination/CSV/keyboard and mobile containment.');
}finally{if(browser)await browser.close();if(server)await new Promise(done=>server.httpServer.close(done));}




