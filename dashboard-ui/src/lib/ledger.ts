import {orders,type OrdersParams} from './api';
import type {components} from '../types/api';
type Order=components['schemas']['Order'];
export function csvCell(value:unknown):string{
 let text=String(value??'');if(/^[\s]*[=+@-]/.test(text))text=`'${text}`;
 return `"${text.replaceAll('"','""')}"`;
}
export async function exportLedger(params:OrdersParams,signal:AbortSignal):Promise<string>{
 const rows:Order[]=[];let total:number|undefined;
 for(let page=1;;page++){
  signal.throwIfAborted();const result=await orders({...params,page,page_size:200},signal);
  if(total!==undefined&&total!==result.total)throw new Error('History changed during export. Please retry.');
  total=result.total;rows.push(...result.rows);
  if(rows.length>=total)break;
  if(!result.rows.length)throw new Error('Export stopped before all rows were received.');
 }
 const fields:(keyof Order)[]=['order_timestamp','account_label','account_id','platform','platform_order_id','restaurant_name','order_status','items_summary','final_amount_paid','total_discount','reported_savings','delivery_fee','packaging_fee','platform_fee','payment_method','financial_verified'];
 return '\ufeff'+[fields.map(csvCell).join(','),...rows.map(row=>fields.map(key=>csvCell(row[key])).join(','))].join('\r\n');
}
