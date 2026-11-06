import {CommandPalette} from './CommandPalette';
import {DesignSystem} from './DesignSystem';
import {DataPage,HealthPage} from './DataPages';
import {AnalyticsPage} from './AnalyticsPages';
import {Overview} from './Overview';
import {Ledger} from './Ledger';
import {Link,Route,Routes,useLocation} from 'react-router-dom';
import {useHealth} from '../hooks/api';
import {FilterProvider,useFilters} from './FilterContext';
import {AccountSelector} from './AccountSelector';
import {FilterBar} from './FilterBar';
import {ThemeControl} from './ThemeControl';
import '../styles/app.css';
const pages=['Overview','Spending','Food','Behavior','Places','Ledger','Data health'];
function Shell(){
 const location=useLocation();const {filters,metadata,notice}=useFilters();const health=useHealth(filters);
 return <div className="v2"><header><div className="brand">Food Khata <span>Your food story</span></div><CommandPalette/><ThemeControl/><AccountSelector/></header>
 <nav aria-label="Main navigation">{pages.map((page,i)=><Link key={page} to={{pathname:i===0?'/':`/${page.toLowerCase().replace(' ','-')}`,search:location.search}}>{page}</Link>)}<Link to="/design-system">Design system</Link><a href="/legacy">Legacy dashboard</a></nav>
 <p role="status" aria-live="polite">{notice}</p>
 {metadata.isError?<div role="alert">Filter options could not load. <button onClick={()=>void metadata.refetch()}>Retry</button></div>:metadata.isPending?<p role="status">Loading filter options…</p>:<FilterBar/>}
 {health.data&&(!health.data.history_complete||!health.data.details_complete)&&<p className="partial" role="status">Some API-visible history or order details are incomplete for this account scope.</p>}
 <main><Routes>{pages.map((page,i)=><Route key={page} path={i===0?'/':`/${page.toLowerCase().replace(' ','-')}`} element={page==="Overview"?<Overview/>:page==="Ledger"?<Ledger/>:page==="Behavior"||page==="Places"?<DataPage page={page}/>:page==="Data health"?<HealthPage/>:page==="Food"||page==="Spending"?<AnalyticsPage page={page}/>:<section className="page-panel"><h1>{page}</h1><p>This page is not available yet.</p></section>}/>)}<Route path="/design-system" element={<DesignSystem/>}/><Route path="*" element={<h1>Page not found</h1>}/></Routes></main>
 <footer>Food orders only; Instamart/Dineout excluded; API-visible history only. Saved details are snapshots; later refunds or status changes may be missing.</footer></div>;
}
export function App(){return <FilterProvider><Shell/></FilterProvider>;}

