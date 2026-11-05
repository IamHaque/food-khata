import {useEffect,useState} from 'react';
import {useFilters} from './FilterContext';
import {validateFilters,type FilterState} from '../lib/filters';

function Amount({field,label}:{field:'amount_min'|'amount_max';label:string}){
 const {filters,update}=useFilters();const [value,setValue]=useState(filters[field]?.toString()??'');
 useEffect(()=>setValue(filters[field]?.toString()??''),[filters,field]);
 useEffect(()=>{const id=setTimeout(()=>{const amount=value===''?null:Number(value);if(amount!==filters[field]&&(amount===null||Number.isFinite(amount))) {
 if(field==='amount_min'&&amount!==null&&filters.amount_max!==null&&amount>filters.amount_max)return;
 if(field==='amount_max'&&amount!==null&&filters.amount_min!==null&&amount<filters.amount_min)return;
 update({[field]:amount});}},250);return()=>clearTimeout(id);},[value,field,filters,update]);
 return <label>{label}<input type="number" value={value} onChange={e=>setValue(e.target.value)}/></label>;
}
export function FilterBar(){
 const {filters,update,clear,metadata}=useFilters();const meta=metadata.data;
 const [saved,setSaved]=useState('');const [error,setError]=useState('');
 const lists:('platforms'|'statuses'|'restaurant_ids'|'cities'|'localities'|'cuisines'|'payment_methods')[]=['platforms','statuses','restaurant_ids','cities','localities','cuisines','payment_methods'];
 const labels={platforms:'Platforms',statuses:'Statuses',restaurant_ids:'Restaurants',cities:'Cities',localities:'Localities',cuisines:'Cuisines',payment_methods:'Payment methods'};
 function preset(name:string){
 const now=new Date();const end=new Date(now.getFullYear(),now.getMonth(),now.getDate());let start=new Date(end);
 if(name==='all'){update({date_from:null,date_to:null});return;}
 if(name==='custom')return;
 if(name==='7d'||name==='30d'||name==='90d')start.setDate(start.getDate()-Number(name.slice(0,-1))+1);
 if(name==='month')start=new Date(now.getFullYear(),now.getMonth(),1);
 if(name==='last_month'){start=new Date(now.getFullYear(),now.getMonth()-1,1);end.setDate(0);}
 if(name==='year')start=new Date(now.getFullYear(),0,1);
 if(name==='fy')start=new Date(now.getFullYear()-(now.getMonth()<3?1:0),3,1);
 const iso=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 update({date_from:iso(start),date_to:iso(end)});
 }
 const active=Object.entries(filters).filter(([key,value])=>!['account_ids'].includes(key)&&(Array.isArray(value)?value.length>0&&!(key==='statuses'&&value.join()==='DELIVERED'):value!==null&&value!==false&&value!=='all'&&value!=='none'));
 return <section aria-label="Global filters" className="filter-panel"><details open><summary>Filters · {active.length} active</summary>
 <div className="filter-grid"><label>Date preset<select defaultValue="custom" onChange={e=>preset(e.target.value)}>{[['7d','Last 7 days'],['30d','Last 30 days'],['90d','Last 90 days'],['month','This month'],['last_month','Last month'],['fy','This FY'],['year','YTD'],['all','All time'],['custom','Custom']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
 <label>From date<input type="date" max={filters.date_to??undefined} value={filters.date_from??''} onChange={e=>update({date_from:e.target.value||null})}/></label>
 <label>To date<input type="date" min={filters.date_from??undefined} value={filters.date_to??''} onChange={e=>update({date_to:e.target.value||null})}/></label>
 {lists.map(key=>{const options=key==='restaurant_ids'?meta?.restaurants.map(r=>({value:r.id,label:r.name}))??[]:(meta?.[key]??[]).map(v=>({value:v,label:v}));return <label key={key}>{labels[key]}<select multiple value={filters[key]} onChange={e=>update({[key]:Array.from(e.target.selectedOptions,o=>o.value)})} aria-label={labels[key]}>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;})}
 <label>Diet<select value={filters.veg} onChange={e=>update({veg:e.target.value as FilterState['veg']})}>{['all','veg','nonveg','unknown'].map(v=><option key={v}>{v}</option>)}</select></label>
 <Amount field="amount_min" label="Minimum amount"/><Amount field="amount_max" label="Maximum amount"/>
 <label>Meal slots<select multiple value={filters.meal_slots} onChange={e=>update({meal_slots:Array.from(e.target.selectedOptions,o=>o.value) as FilterState['meal_slots']})}>{['breakfast','lunch','snack','dinner','late_night'].map(v=><option key={v}>{v}</option>)}</select></label>
 <label>Day type<select value={filters.day_type} onChange={e=>update({day_type:e.target.value as FilterState['day_type']})}>{['all','weekday','weekend'].map(v=><option key={v}>{v}</option>)}</select></label>
 <label>Compare<select value={filters.compare} onChange={e=>update({compare:e.target.value as FilterState['compare']})}>{['none','previous_period','previous_year'].map(v=><option key={v}>{v}</option>)}</select></label>
 <label>Search restaurant or item<input type="search" value={filters.search??''} onChange={e=>update({search:e.target.value||null})}/></label>
 <label className="check"><input type="checkbox" checked={filters.verified_only} onChange={e=>update({verified_only:e.target.checked})}/>Verified only</label></div>
 <div className="chips">{active.map(([key,value])=><button key={key} onClick={()=>update({[key]:Array.isArray(value)?[]:typeof value==='boolean'?false:key==='veg'||key==='day_type'?'all':key==='compare'?'none':null})}>{key.replaceAll('_',' ')}: {String(value)} ×</button>)}<button onClick={clear}>Clear filters</button>
 <button onClick={()=>{try{localStorage.setItem('food-khata-preset',JSON.stringify(filters));setSaved('Preset saved');}catch{setError('Could not save preset');}}}>Save preset</button>
 <button onClick={()=>{try{const raw=localStorage.getItem('food-khata-preset');if(raw){const candidate:unknown=JSON.parse(raw);update(validateFilters(candidate));setSaved('Preset loaded');}}catch{setError('Could not load preset');}}}>Load preset</button></div>
 <p role="status">{saved}</p>{error&&<p role="alert">{error}</p>}</details></section>;
}

