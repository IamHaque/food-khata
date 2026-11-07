import '@fontsource-variable/inter';
import './style.css';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import { Providers } from './app/providers';
import { initTheme } from './app/theme';

initTheme();

if (window.location.pathname === '/legacy') {
  void import('./main.jsx');
} else {
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing root element');
  createRoot(root).render(<Providers><BrowserRouter><App /></BrowserRouter></Providers>);
}