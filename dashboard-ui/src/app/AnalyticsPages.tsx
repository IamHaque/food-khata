import {SpendingDetails} from './SpendingDetails';
import {FoodLeaders} from './FoodLeaders';
import {useDashboard} from '../hooks/api';
import {useFilters} from './FilterContext';
import {Chart} from './Chart';
export function AnalyticsPage({page}:{page:'Food'|'Spending'}){
 const {filters,clear}=useFilters();const query=useDashboard(filters);const data=query.data;
 if(!data)return <section className="page-panel" role={query.isError?'alert':'status'}>{query.isError?<><p>{page} could not load.</p><button onClick={()=>void query.refetch()}>Retry</button></>:'Loading…'}</section>;
 const food=data.charts.food;const spending=data.charts.spending;
 const panels=page==='Food'?[
 {title:'Cuisine spend',labels:food.cuisines.map(x=>x.name),values:food.cuisines.map(x=>x.spend),reason:food.cuisine_unavailable_reason},
 {title:'Restaurant loyalty',labels:food.loyalty.map(x=>x.name),values:food.loyalty.map(x=>x.orders)},
 {title:'Diet item quantities',labels:food.diet.map(x=>x.diet),values:food.diet.map(x=>x.quantity),reason:food.diet_unavailable_reason},
 {title:'New restaurant orders',labels:food.new_repeat.map(x=>x.month),values:food.new_repeat.map(x=>x.new_orders)},
 {title:'Repeat restaurant orders',labels:food.new_repeat.map(x=>x.month),values:food.new_repeat.map(x=>x.repeat_orders)}
 ]:[
 {title:'Daily spend',labels:spending.daily.map(x=>x.date),values:spending.daily.map(x=>x.spend)},
 {title:'Cumulative spend',labels:spending.daily.map(x=>x.date),values:spending.daily.map(x=>x.cumulative)},
 {title:'Rolling 30-day spend',labels:spending.daily.map(x=>x.date),values:spending.daily.map(x=>x.rolling_30)},
 {title:'Monthly fees',labels:data.charts.monthly_fee_components.map(x=>x.month??'Unknown'),values:data.charts.monthly_fee_components.map(x=>x.total_fees)}
 ];
 return <section aria-busy={query.isFetching}><h1>{page}</h1>{query.isError&&<p role="alert">Refresh failed. <button onClick={()=>void query.refetch()}>Retry</button></p>}{!data.kpis.orders?<div className="page-panel">No orders match these filters. <button onClick={clear}>Clear filters</button></div>:panels.map(panel=><div className="page-panel" key={panel.title}><h2>{panel.title}</h2>{'reason' in panel&&panel.reason?<p>{panel.reason}</p>:<Chart summary={panel.title} headers={['Period or group',panel.title]} rows={panel.labels.map((label,i)=>[label,panel.values[i]])} option={{tooltip:{trigger:'axis',renderMode:'richText'},grid:{left:80,right:25,bottom:75},xAxis:{type:'category',data:panel.labels,axisLabel:{hideOverlap:true}},yAxis:{type:'value'},series:[{name:panel.title,type:page==='Spending'?'line':'bar',data:panel.values}]}}/>}</div>)}{page==='Food'?<><div className="page-panel"><h2>Cuisine share</h2><Chart summary="Provider-paid spend by cuisine" headers={['Cuisine','Spend']} rows={food.cuisines.map(x=>[x.name,x.spend])} option={{tooltip:{renderMode:'richText'},series:[{type:'pie',radius:['35%','65%'],label:{show:false},data:food.cuisines.map(x=>({name:x.name,value:x.spend}))}]}}/></div><div className="page-panel"><h2>Diet quantities over time</h2>{food.diet_unavailable_reason?<p>{food.diet_unavailable_reason}</p>:<Chart summary="Monthly veg, non-veg and unknown item quantities" headers={['Month','Veg','Non-veg','Unknown']} rows={food.diet_monthly.map(x=>[x.month,x.veg,x.non_veg,x.unknown])} option={{tooltip:{trigger:'axis',renderMode:'richText'},legend:{},xAxis:{type:'category',data:food.diet_monthly.map(x=>x.month)},yAxis:{type:'value'},series:([['veg','Veg'],['non_veg','Non-veg'],['unknown','Unknown']] as const).map(([key,name])=>({name,type:'bar',stack:'diet',data:food.diet_monthly.map(x=>x[key])}))}}/>}</div><div className="page-panel"><h2>Restaurant loyalty</h2><Chart summary="Restaurant order count versus average order value" headers={['Restaurant','Orders','AOV']} rows={food.loyalty.map(x=>[x.name,x.orders,x.aov])} option={{tooltip:{renderMode:'richText'},xAxis:{type:'value',name:'Orders'},yAxis:{type:'value',name:'AOV'},series:[{type:'scatter',data:food.loyalty.map(x=>({name:x.name,value:[x.orders,x.aov]}))}]}}/></div><FoodLeaders/></>:<SpendingDetails charts={data.charts}/>}</section>;
}

