import {OrderModal} from './OrderModal';
import {useEffect,useRef,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {useReactTable,getCoreRowModel,flexRender,type ColumnDef,type VisibilityState} from '@tanstack/react-table';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '../components/ui/table';
import {useOrders} from '../hooks/api';
import {useFilters} from './FilterContext';
import {exportLedger} from '../lib/ledger';
import type {components} from '../types/api';
type Order=components['schemas']['Order'];
const money=(n:number|null|undefined)=>n==null?'Unknown':new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(n);
const sortKeys=['date','restaurant','platform','status','discount','fees','amount'];
export function Ledger(){
 const {filters,update,clear}=useFilters();const [params,setParams]=useSearchParams();
 useEffect(()=>{if(!params.has('statuses'))update({statuses:[]});},[params,update]);
 const rawPage=Number(params.get('page')??1);const page=Number.isInteger(rawPage)&&rawPage>0?rawPage:1;
 const requestedSize=Number(params.get('page_size')??50);const pageSize=[25,50,100,200].includes(requestedSize)?requestedSize:50;
 const requestedSort=params.get('sort')??'date';const sort=sortKeys.includes(requestedSort)?requestedSort:'date';
 const direction=params.get('direction')==='asc'?'asc':'desc';
 const request={...filters,statuses:params.has('statuses')?filters.statuses:[],page,page_size:pageSize,sort,direction};
 const query=useOrders(request);const [visibility,setVisibility]=useState<VisibilityState>({});const [compact,setCompact]=useState(false);
 const [exporting,setExporting]=useState(false);const [exportMessage,setExportMessage]=useState('');const abort=useRef<AbortController|null>(null);
 const scope=JSON.stringify(filters);useEffect(()=>()=>abort.current?.abort(),[scope]);
 const change=(patch:Record<string,string>)=>{const next=new URLSearchParams(params);for(const[k,v]of Object.entries(patch))next.set(k,v);setParams(next);};
 const open=(id:string)=>{const next=new URLSearchParams(params);next.set('order',id);setParams(next);};
 const sortable=(id:string,label:string)=><button onClick={()=>change({sort:id,direction:sort===id&&direction==='desc'?'asc':'desc',page:'1'})}>{label}{sort===id?(direction==='asc'?' ↑':' ↓'):''}</button>;
 const columns:ColumnDef<Order>[]=[
 {id:'date',header:()=>sortable('date','Date'),accessorKey:'order_timestamp'},
 ...(filters.account_ids.length?[]:[{id:'account',header:'Account',accessorKey:'account_label'}]),
 {id:'restaurant',header:()=>sortable('restaurant','Restaurant'),accessorKey:'restaurant_name',cell:info=><span className="truncate-cell" title={info.row.original.restaurant_name??'Unknown'}>{info.row.original.restaurant_name??'Unknown'}</span>},
 {id:'items',header:'Items',accessorKey:'items_summary',cell:info=><span className="truncate-cell" title={info.row.original.items_summary??'Unknown'}>{info.row.original.items_summary??'Unknown'}</span>},
 {id:'platform',header:()=>sortable('platform','Platform'),accessorKey:'platform',cell:info=><span className="badge">◈ {info.row.original.platform}</span>},
 {id:'status',header:()=>sortable('status','Status'),accessorKey:'order_status',cell:info=><span className="badge">● {info.row.original.order_status}</span>},
 {id:'discount',header:()=>sortable('discount','Discount'),cell:info=>money(info.row.original.total_discount)},
 {id:'fees',header:()=>sortable('fees','Fees'),cell:info=><span title="Net delivery, packaging and platform fees">{money(info.row.original.fees)}</span>},
 {id:'amount',header:()=>sortable('amount','Amount'),cell:info=>money(info.row.original.final_amount_paid)},
 {id:'verified',header:'Bill balance',cell:info=>info.row.original.financial_verified?'✓ Matches':'! Review'},
 ];
 const table=useReactTable({data:query.data?.rows??[],columns,getCoreRowModel:getCoreRowModel(),manualPagination:true,manualSorting:true,rowCount:query.data?.total??0,state:{columnVisibility:visibility,pagination:{pageIndex:page-1,pageSize}},onColumnVisibilityChange:setVisibility});
 async function download(){const controller=new AbortController();abort.current=controller;setExporting(true);setExportMessage('');try{const csv=await exportLedger(request,controller.signal);const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='food-khata-orders.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setExportMessage('CSV exported');}catch(error){setExportMessage(error instanceof Error&&error.name==='AbortError'?'Export cancelled':'Could not export. Please retry.');}finally{setExporting(false);}}
 const total=query.data?.total??0;const start=total?Math.min((page-1)*pageSize+1,total):0;const end=Math.min(page*pageSize,total);
 return <section className="page-panel"><h1>Ledger</h1><p>All amounts remain provider totals. “Matches” means known components balance within INR 1, not bank verification.</p>
 <div className="ledger-tools"><label>Rows per page<select aria-label="Rows per page" value={pageSize} onChange={e=>change({page_size:e.target.value,page:'1'})}>{[25,50,100,200].map(n=><option key={n}>{n}</option>)}</select></label><label>Density<select aria-label="Density" value={compact?'compact':'comfortable'} onChange={e=>setCompact(e.target.value==='compact')}><option>comfortable</option><option>compact</option></select></label>
 <details><summary>Columns</summary>{table.getAllLeafColumns().map(column=><label className="check" key={column.id}><input type="checkbox" checked={column.getIsVisible()} onChange={column.getToggleVisibilityHandler()}/>{column.id}</label>)}</details>
 <button disabled={exporting||query.isPending||query.isError} onClick={()=>void download()}>Export CSV</button>{exporting&&<button onClick={()=>abort.current?.abort()}>Cancel export</button>}</div><p role="status">{exportMessage}</p>
 {query.isError?<p role="alert">Orders could not load. <button onClick={()=>void query.refetch()}>Retry</button></p>:query.isPending?<div aria-busy="true" className="ledger-skeleton">Loading order history…</div>:total===0?<div><p>No orders match these filters</p><p>Try clearing the restaurant, search or date restriction.</p><button onClick={clear}>Clear filters</button></div>:<>
 <div className={`ledger-scroll ${compact?'compact':''}`} role="region" aria-label="Order history" tabIndex={0} aria-busy={query.isFetching}><Table><TableHeader>{table.getHeaderGroups().map(group=><TableRow key={group.id}>{group.headers.map(header=><TableHead key={header.id} aria-sort={sortKeys.includes(header.id)?sort===header.id?(direction==='asc'?'ascending':'descending'):'none':undefined}>{flexRender(header.column.columnDef.header,header.getContext())}</TableHead>)}</TableRow>)}</TableHeader><TableBody>{table.getRowModel().rows.map(row=><TableRow key={row.original.id} tabIndex={0} data-order-id={row.original.id} onClick={()=>open(row.original.id)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();open(row.original.id);}}} aria-label={`Open order ${row.original.platform_order_id}`}>{row.getVisibleCells().map(cell=><TableCell key={cell.id} className={['discount','fees','amount'].includes(cell.column.id)?'numeric':''}>{flexRender(cell.column.columnDef.cell,cell.getContext())}</TableCell>)}</TableRow>)}</TableBody></Table></div>
 <div className="ledger-footer"><p>Showing {start}–{end} of {total} · Total for all filtered orders: {money(query.data?.filtered_total_amount)}</p><button disabled={page===1||query.isFetching} onClick={()=>change({page:String(page-1)})}>Previous page</button><button disabled={end>=total||query.isFetching} onClick={()=>change({page:String(page+1)})}>Next page</button></div></>}
 <OrderModal rows={query.data?.rows??[]} request={request}/></section>;
}
