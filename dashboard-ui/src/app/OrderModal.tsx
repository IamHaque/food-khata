import {useEffect,useRef,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../components/ui/dialog';
import {useBill} from '../hooks/api';
import {orders,type OrdersParams} from '../lib/api';
import type {components} from '../types/api';
import '../styles/modal.css';
type Order=components['schemas']['Order'];
const money=(value:number|null|undefined)=>value==null?'Unknown':new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(value);
export function OrderModal({rows,request}:{rows:Order[];request:OrdersParams}){
 const [params,setParams]=useSearchParams();const id=params.get('order')??undefined;
 const bill=useBill(id,request);const data=!bill.isPlaceholderData&&!bill.isError&&bill.data?.order.id===id?bill.data:undefined;
 const last=useRef(id);const origin=useRef<HTMLElement|null>(null);const controller=useRef<AbortController|null>(null);
 const [navigating,setNavigating]=useState(false);const [error,setError]=useState('');
 const scope=JSON.stringify(request);
 useEffect(()=>{if(id){last.current=id;if(!origin.current&&document.activeElement instanceof HTMLElement)origin.current=document.activeElement;}},[id]);
 useEffect(()=>()=>controller.current?.abort(),[scope]);
 const close=()=>{const next=new URLSearchParams(params);next.delete('order');setParams(next);};
 async function adjacent(delta:number){
  if(!id||navigating)return;setNavigating(true);setError('');const abort=new AbortController();controller.current=abort;
  try{
   let index=rows.findIndex(row=>row.id===id);let neighbor:Order|undefined;let targetPage=Number(request.page??1);const size=Number(request.page_size??50);
   if(index>=0){neighbor=rows[index+delta];if(!neighbor&&targetPage+delta>0){const result=await orders({...request,page:targetPage+delta},abort.signal);neighbor=delta>0?result.rows[0]:result.rows.at(-1);targetPage+=delta;}}
   else {
    for(let page=1;;page++){
     const result=await orders({...request,page,page_size:200},abort.signal);index=result.rows.findIndex(row=>row.id===id);
     if(index>=0){const offset=index+delta;neighbor=result.rows[offset];const globalIndex=(page-1)*200+offset;
      if(!neighbor&&globalIndex>=0&&globalIndex<result.total){const other=await orders({...request,page:page+delta,page_size:200},abort.signal);neighbor=delta>0?other.rows[0]:other.rows.at(-1);}
      targetPage=Math.floor(globalIndex/size)+1;break;
     }
     if(page*200>=result.total)break;
    }
   }
   if(neighbor&&!abort.signal.aborted){const next=new URLSearchParams(params);next.set('order',neighbor.id);next.set('page',String(targetPage));setParams(next);}
  }catch(reason){if(!(reason instanceof Error&&reason.name==='AbortError'))setError('Could not load the adjacent order. Please retry.');}finally{setNavigating(false);}
 }
 const o=data?.order;
 const ladder:[string,number|null|undefined][]=[];
 if(o)ladder.push(['Item subtotal',o.item_subtotal],['Food discount (deducted)',o.food_discount],['Net delivery fee',o.delivery_fee],['Delivery discount (already included in net delivery)',o.delivery_fee_discount],['Packaging',o.packaging_fee],['Platform fee',o.platform_fee],['Tax',o.total_tax],['Tip',o.tip],['Other charges',o.other_charges],['Refund (reported separately)',o.refund_amount]);
 return <Dialog open={!!id} onOpenChange={open=>{if(!open)close();}}><DialogContent className="order-modal" onCloseAutoFocus={event=>{event.preventDefault();const row=Array.from(document.querySelectorAll<HTMLElement>('[data-order-id]')).find(node=>node.dataset.orderId===last.current);(row??(origin.current?.isConnected?origin.current:document.querySelector<HTMLElement>('[aria-label="Order history"]')))?.focus();origin.current=null;}} onKeyDown={event=>{if(event.target instanceof HTMLElement&&event.target.closest('input,textarea,select,pre,[contenteditable=true]'))return;if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();void adjacent(event.key==='ArrowRight'?1:-1);}}}>
 <header className="order-modal-header"><DialogTitle title={o?.restaurant_name??undefined}>{o?.restaurant_name??'Order details'}</DialogTitle><DialogDescription>{o?`${o.platform} · ${o.order_status} · ${o.order_timestamp}`:'Loading the selected order'}</DialogDescription></header>
 <div className="order-modal-body" aria-busy={bill.isFetching||navigating}>
 {bill.isError?<p role="alert">Order details could not load. <button onClick={()=>void bill.refetch()}>Retry</button></p>:!data?<div className="bill-skeleton" role="status">Loading receipt…</div>:<>
 <dl className="order-context"><dt>Order</dt><dd>{o?.platform_order_id}</dd><dt>Account</dt><dd>{o?.account_label} · {o?.account_id}</dd>{o?.payment_method&&<><dt>Payment</dt><dd>{o.payment_method}</dd></>}{o?.address_label&&<><dt>Delivery label</dt><dd>{o.address_label}</dd></>}{o?.city&&<><dt>City</dt><dd>{o.city}</dd></>}{o?.user_rating!=null&&<><dt>Rating</dt><dd>{o.user_rating}</dd></>}</dl>
 <h2>What was ordered</h2><div className="bill-table-scroll"><table><thead><tr><th>Item</th><th>Diet</th><th>Quantity</th><th>Unit price</th><th>Line total</th></tr></thead><tbody>{data.items.map((item,index)=><tr key={index}><td><span title={item.item_name}>{item.item_name}</span>{item.category&&<small>{item.category}</small>}</td><td>{item.is_veg==null?'? Unknown':item.is_veg?'● Veg':'◆ Non-veg'}</td><td>{item.quantity}</td><td>{money(item.unit_price)}</td><td>{money(item.total_price)}</td></tr>)}</tbody></table></div>
 <h2>Payment breakdown</h2><dl className="bill-ladder">{ladder.filter(([,value])=>value!=null).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{money(value)}</dd></div>)}<div className="bill-final"><dt>Final paid</dt><dd>{money(o?.final_amount_paid)}</dd></div></dl>
 {!!data.discount_items.length&&<section><h3>Itemized discounts</h3><dl className="bill-ladder">{data.discount_items.map((discount,index)=><div key={index}><dt>{discount.label}</dt><dd>{money(discount.amount)}</dd></div>)}</dl></section>}
 <p className="balance-badge" title="Known components balance within INR 1. This does not verify bank transactions.">{data.reconciliation_label}</p>{data.reconciliation_status==='off'&&<p>Provider total retained; known bill components do not fully reconcile.</p>}{!o?.source_complete&&<p>Some source bill details are incomplete.</p>}
 {data.source_bill!=null&&<details><summary>Raw bill data</summary><pre tabIndex={0}>{JSON.stringify(data.source_bill,null,2)}</pre></details>}
 </>}{error&&<p role="alert">{error}</p>}</div>
 <footer className="order-modal-footer"><button disabled={navigating||bill.isPending} onClick={()=>void adjacent(-1)}>Previous order</button><button disabled={navigating||bill.isPending} onClick={()=>void adjacent(1)}>Next order</button><button onClick={close}>Close receipt</button></footer>
 </DialogContent></Dialog>;
}
