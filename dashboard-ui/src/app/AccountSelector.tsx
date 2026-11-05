import {useState} from 'react';
import {useFilters} from './FilterContext';
export function AccountSelector(){
 const {filters,update,metadata}=useFilters();const [search,setSearch]=useState('');
 const accounts=metadata.data?.all_accounts??[];
 if(accounts.length===1)return <p>Account: {accounts[0].label} · {accounts[0].id} · {accounts[0].order_count} orders</p>;
 return <div className="account-controls"><label>Search accounts<input type="search" value={search} onChange={e=>setSearch(e.target.value)} /></label>
 <label>Account<select aria-label="Account" value={filters.account_ids[0]??''} onChange={e=>update({account_ids:e.target.value?[e.target.value]:[]})}><option value="">All accounts</option>
 {accounts.filter(a=>`${a.label} ${a.id} ${a.platforms.join(' ')}`.toLowerCase().includes(search.toLowerCase()) || filters.account_ids.includes(a.id)).map(a=><option key={a.id} value={a.id}>{a.label} · {a.id} · {a.platforms.join('/')} · {a.order_count} orders · {a.date_from??'Unknown'}–{a.date_to??'Unknown'}</option>)}
 </select></label></div>;
}

