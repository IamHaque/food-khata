import { Link, Route, Routes } from 'react-router-dom';

const pages = ['Overview', 'Spending', 'Food', 'Behavior', 'Places', 'Ledger', 'Data health'];
export function App() {
  return <><header><h1>Food Khata</h1><nav aria-label="Main navigation">{pages.map((page, i) => <span key={page}><Link to={i === 0 ? '/' : `/${page.toLowerCase().replace(' ', '-')}`}>{page}</Link>{' '}</span>)}<a href="/legacy">Legacy dashboard</a></nav></header><main><Routes>{pages.map((page, i) => <Route key={page} path={i === 0 ? '/' : `/${page.toLowerCase().replace(' ', '-')}`} element={<><h2>{page}</h2><p>This page is not available yet.</p></>} />)}<Route path="*" element={<h2>Page not found</h2>} /></Routes></main></>;
}
