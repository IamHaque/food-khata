import '@fontsource-variable/inter';
import './style.css';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import { Providers } from './app/providers';

try {
  const theme = localStorage.getItem('food-khata-v2-theme') ?? 'system';
  const isDark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.dataset.v2theme = isDark ? 'dark' : 'light';
} catch {
  const isDark = matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.dataset.v2theme = isDark ? 'dark' : 'light';
}

if (window.location.pathname === '/legacy') {
  void import('./main.jsx');
} else {
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing root element');
  createRoot(root).render(<Providers><BrowserRouter><App /></BrowserRouter></Providers>);
}

