import {Link,Route,Routes} from 'react-router-dom';
import {useHealth} from '../hooks/api';
import {FilterProvider,useFilters} from './FilterContext';
import {AccountSelector} from './AccountSelector';
import {FilterBar} from './FilterBar';
import {ThemeControl} from './ThemeControl';
import '../styles/app.css';
const pages=['Overview','Spending','Food','Behavior','Places','Ledger','Data health'];
function Shell(){
 const {filters,metadata,notice}=useFilters();const health=useHealth(filters);
 return <div className="v2"><header><div className="brand">Food Khata <span>Your food story</span></div><ThemeControl/><AccountSelector/></header>
 <nav aria-label="Main navigation">{pages.map((page,i)=><Link key={page} to={i===0?'/':`/${page.toLowerCase().replace(' ','-')}`}>{page}</Link>)}<Link to="/design-system">Design system</Link><a href="/legacy">Legacy dashboard</a></nav>
 <p role="status" aria-live="polite">{notice}</p>
 {metadata.isError?<div role="alert">Filter options could not load. <button onClick={()=>void metadata.refetch()}>Retry</button></div>:metadata.isPending?<p role="status">Loading filter options…</p>:<FilterBar/>}
 {health.data&&(!health.data.history_complete||!health.data.details_complete)&&<p className="partial" role="status">Some API-visible history or order details are incomplete for this account scope.</p>}
 <main><Routes>{pages.map((page,i)=><Route key={page} path={i===0?'/':`/${page.toLowerCase().replace(' ','-')}`} element={<section className="page-panel"><h1>{page}</h1><p>This page is not available yet.</p></section>}/>)}<Route path="/design-system" element={<section className="page-panel"><h1>Design system</h1><p>Opaque surface · readable text · keyboard focus</p><button>Button</button><label>Input<input placeholder="Example"/></label></section>}/><Route path="*" element={<h1>Page not found</h1>}/></Routes></main>
 <footer>Food orders only; Instamart/Dineout excluded; API-visible history only. Saved details are snapshots; later refunds or status changes may be missing.</footer></div>;
}
export function App(){return <FilterProvider><Shell/></FilterProvider>;}
