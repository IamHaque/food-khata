import { useState } from 'react';
import { CommandPalette } from './CommandPalette';
import { DesignSystem } from './DesignSystem';
import { DataPage, HealthPage } from './DataPages';
import { AnalyticsPage } from './AnalyticsPages';
import { Overview } from './Overview';
import { Ledger } from './Ledger';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { useHealth } from '../hooks/api';
import { FilterProvider, useFilters } from './FilterContext';
import { AccountSelector } from './AccountSelector';
import { FilterBar } from './FilterBar';
import { ThemeControl } from './ThemeControl';
import {
  LayoutDashboard,
  TrendingUp,
  Utensils,
  Clock,
  MapPin,
  Receipt,
  Activity,
  Palette,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  UtensilsCrossed,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import '../styles/app.css';

const pages = [
  { name: 'Overview', icon: LayoutDashboard },
  { name: 'Spending', icon: TrendingUp },
  { name: 'Food', icon: Utensils },
  { name: 'Behavior', icon: Clock },
  { name: 'Places', icon: MapPin },
  { name: 'Ledger', icon: Receipt },
  { name: 'Data health', icon: Activity },
];

function Shell() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { filters, metadata, notice } = useFilters();
  const health = useHealth(filters);

  return (
    <div className="v2 min-h-screen bg-background text-foreground flex flex-col font-sans max-w-full overflow-x-hidden">
      {/* Top Header */}
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 border-b bg-card/95 px-3 sm:px-6 py-2.5 backdrop-blur shadow-xs">
        {/* Brand */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs shrink-0">
            <UtensilsCrossed className="h-4 w-4" />
          </div>
          <div className="brand leading-none">
            <span className="font-bold text-sm sm:text-base tracking-tight text-foreground block">Food Khata</span>
            <span className="text-[10px] text-muted-foreground font-normal hidden sm:block mt-0.5">Your food story</span>
          </div>
        </div>

        {/* Center: Account Selector */}
        <div className="flex items-center shrink-0 py-0.5">
          <AccountSelector />
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {health.data && (
            <small
              role="status"
              className="hidden xl:inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-full border border-border/50"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Updated {new Date(health.data.generated_at).toLocaleString()}
            </small>
          )}
          <CommandPalette />
          <ThemeControl />
        </div>
      </header>

      {/* Main Container with Sidebar + Content */}
      <div className={`shell-layout flex-1 flex flex-col lg:flex-row min-h-0 w-full max-w-full ${collapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Navigation: Horizontal scroll on mobile, vertical sidebar on lg */}
        <nav
          aria-label="Main navigation"
          className={`border-b lg:border-b-0 lg:border-r bg-card/40 transition-all duration-200 shrink-0 ${
            collapsed ? 'lg:w-16' : 'lg:w-56'
          } flex flex-row lg:flex-col justify-between p-2 lg:p-3 gap-1 overflow-x-auto lg:overflow-x-visible`}
        >
          <div className="flex flex-row lg:flex-col items-center lg:items-stretch gap-1 w-full">
            <button
              aria-label="Toggle sidebar"
              aria-expanded={!collapsed}
              onClick={() => setCollapsed(!collapsed)}
              className="hidden lg:flex items-center justify-center p-2 mb-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground text-xs font-medium transition-colors"
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <div className="flex items-center justify-between w-full px-1">
                  <span>Collapse navigation</span>
                  <ChevronLeft className="h-4 w-4" />
                </div>
              )}
            </button>

            {pages.map((p, i) => {
              const path = i === 0 ? '/' : `/${p.name.toLowerCase().replace(' ', '-')}`;
              const active = location.pathname === path;
              const Icon = p.icon;
              return (
                <Link
                  key={p.name}
                  to={{ pathname: path, search: location.search }}
                  title={p.name}
                  aria-label={p.name}
                  className={`flex items-center gap-2 lg:gap-3 px-2.5 py-1.5 lg:py-2 rounded-lg text-xs lg:text-sm font-medium whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  } ${collapsed ? 'lg:justify-center lg:px-2' : ''}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className={collapsed ? 'lg:hidden' : ''}>{p.name}</span>
                </Link>
              );
            })}
          </div>

          {/* Secondary Links */}
          <div className="hidden lg:flex flex-col border-t pt-2 space-y-1">
            <Link
              to="/design-system"
              title="Design system"
              aria-label="Design system"
              className={`flex items-center gap-3 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors ${
                collapsed ? 'justify-center px-2' : ''
              }`}
            >
              <Palette className="h-3.5 w-3.5 shrink-0" />
              {!collapsed && <span>Design system</span>}
            </Link>
            <a
              href="/legacy"
              title="Legacy dashboard"
              aria-label="Legacy dashboard"
              className={`flex items-center gap-3 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors ${
                collapsed ? 'justify-center px-2' : ''
              }`}
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              {!collapsed && <span>Legacy dashboard</span>}
            </a>
          </div>
        </nav>

        {/* Content Area */}
        <div className="shell-content flex-1 min-w-0 max-w-full flex flex-col p-3 sm:p-5 lg:p-7 space-y-5 overflow-x-hidden">
          {notice && (
            <p
              role="status"
              aria-live="polite"
              className="rounded-lg border border-primary/20 bg-primary/10 px-3.5 py-2 text-xs font-medium text-primary flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{notice}</span>
            </p>
          )}

          {metadata.isError ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/20 bg-destructive/10 p-3.5 text-xs text-destructive flex items-center justify-between"
            >
              <span>Filter options could not load.</span>
              <button
                className="rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium shadow-xs hover:bg-accent"
                onClick={() => void metadata.refetch()}
              >
                Retry
              </button>
            </div>
          ) : metadata.isPending ? (
            <p role="status" className="p-3 text-xs text-muted-foreground animate-pulse">
              Loading filter options…
            </p>
          ) : (
            <FilterBar />
          )}

          {health.data && (!health.data.history_complete || !health.data.details_complete) && (
            <p
              className="partial rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2"
              role="status"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>Some API-visible history or order details are incomplete for this account scope.</span>
            </p>
          )}

          {/* Routes */}
          <main className="flex-1 min-w-0 max-w-full">
            <Routes>
              {pages.map((p, i) => (
                <Route
                  key={p.name}
                  path={i === 0 ? '/' : `/${p.name.toLowerCase().replace(' ', '-')}`}
                  element={
                    p.name === 'Overview' ? (
                      <Overview />
                    ) : p.name === 'Ledger' ? (
                      <Ledger />
                    ) : p.name === 'Behavior' || p.name === 'Places' ? (
                      <DataPage page={p.name} />
                    ) : p.name === 'Data health' ? (
                      <HealthPage />
                    ) : p.name === 'Food' || p.name === 'Spending' ? (
                      <AnalyticsPage page={p.name} />
                    ) : (
                      <section className="page-panel rounded-xl border bg-card p-6 shadow-xs">
                        <h1 className="text-xl font-bold">{p.name}</h1>
                        <p className="text-sm text-muted-foreground mt-2">This page is not available yet.</p>
                      </section>
                    )
                  }
                />
              ))}
              <Route path="/design-system" element={<DesignSystem />} />
              <Route
                path="*"
                element={
                  <div className="p-8 text-center">
                    <h1 className="text-2xl font-bold">Page not found</h1>
                  </div>
                }
              />
            </Routes>
          </main>

          <footer className="border-t pt-3 text-center text-xs text-muted-foreground">
            Food orders only; Instamart/Dineout excluded; API-visible history only. Saved details are snapshots; later
            refunds or status changes may be missing.
          </footer>
        </div>
      </div>
    </div>
  );
}

export function App() {
  return (
    <FilterProvider>
      <Shell />
    </FilterProvider>
  );
}
