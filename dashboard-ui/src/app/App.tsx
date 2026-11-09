import { useState, useEffect, lazy, Suspense } from 'react';
import { CommandPalette } from './CommandPalette';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Skeleton } from '../components/ui/skeleton';

const Overview = lazy(() => import('./Overview'));
const AnalyticsPage = lazy(() =>
  import('./AnalyticsPages').then((m) => ({ default: m.AnalyticsPage })),
);
const Orders = lazy(() => import('./Orders').then((m) => ({ default: m.Orders })));
const DesignSystem = lazy(() =>
  import('./DesignSystem').then((m) => ({ default: m.DesignSystem })),
);

function PageSkeleton() {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-live="polite">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
import { useHealth } from '../hooks/api';
import { FilterProvider, useFilters } from './FilterContext';
import { AccountSelector } from './AccountSelector';
import { FilterBar } from './FilterBar';
import { ThemeControl } from './ThemeControl';
import { SyncStatusChip } from './SyncStatusChip';
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../components/ui/tooltip';
import {
  LayoutDashboard,
  TrendingUp,
  Utensils,
  Clock,
  Receipt,
  Palette,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  UtensilsCrossed,
  AlertCircle,
  CheckCircle2,
  Menu,
} from 'lucide-react';
import '../styles/app.css';
import AccessRoutes from '../features/access/routes';
import { RequireAuth, safeReturnPath } from '../features/access/auth';
import { AccessBanners } from '../features/access/banners/AccessBanners';
import { SessionControls } from '../features/access/banners/SessionControls';
import { useAccounts } from '../features/access/api';

const pages = [
  { name: 'Overview', icon: LayoutDashboard },
  { name: 'Spending', icon: TrendingUp },
  { name: 'Food', icon: Utensils },
  { name: 'Habits', icon: Clock },
  { name: 'Orders', icon: Receipt },
];

export function NotFoundPage() {
  const location = useLocation();
  return (
    <div className="p-8 text-center space-y-3">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-sm text-muted-foreground mt-2">
        The page you're looking for doesn't exist or has moved.
      </p>
      <Link to={{ pathname: '/', search: location.search }} className="inline-flex items-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-xs hover:bg-accent">
        Back to Overview
      </Link>
    </div>
  );
}

function Shell() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return globalThis.localStorage?.getItem('food-khata-nav-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      globalThis.localStorage?.setItem('food-khata-nav-collapsed', String(collapsed));
    } catch {
      /* ignore */
    }
  }, [collapsed]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { filters, metadata, notice } = useFilters();
  const health = useHealth(filters);
  const accounts = useAccounts();

  return (
    <TooltipProvider>
    <div className="v2 min-h-screen bg-background text-foreground flex flex-col font-sans max-w-full overflow-x-hidden">
      {/* Accessible skip link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring font-semibold text-xs min-h-[44px] inline-flex items-center"
      >
        Skip to main content
      </a>

      {/* Top Header */}
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 border-b bg-card/95 px-3 sm:px-6 py-2.5 backdrop-blur shadow-xs">
        {/* Brand + Mobile nav toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open navigation menu"
                className="lg:hidden inline-flex items-center justify-center p-2 rounded-md border border-input bg-background min-h-[44px] min-w-[44px] text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-4 bg-card">
              <SheetHeader className="pb-3 border-b text-left">
                <SheetTitle className="text-base font-bold text-foreground flex items-center gap-2">
                  <UtensilsCrossed className="h-4 w-4 text-primary" />
                  <span>Food Khata</span>
                </SheetTitle>
              </SheetHeader>
              <nav aria-label="Mobile drawer navigation" className="flex flex-col gap-1.5 py-4">
                {pages.map((p, i) => {
                  const path = i === 0 ? '/' : `/${p.name.toLowerCase().replace(' ', '-')}`;
                  const active = location.pathname === path;
                  const Icon = p.icon;
                  return (
                    <Link
                      key={p.name}
                      to={{ pathname: path, search: location.search }}
                      onClick={() => setMobileOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium min-h-[44px] transition-colors ${
                        active
                          ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                          : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                      }`}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span>{p.name}</span>
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>

          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs shrink-0">
            <UtensilsCrossed className="h-4 w-4" />
          </div>
          <div className="brand leading-none">
            <span className="font-bold text-sm sm:text-base tracking-tight text-foreground block">Food Khata</span>
            <span className="text-xs text-muted-foreground font-normal hidden sm:block mt-0.5">Your food story</span>
          </div>
        </div>

        {/* Center: Account Selector */}
        <div className="flex items-center shrink-0 py-0.5">
          <AccountSelector />
        </div>

        {/* Right Controls */}
        <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 min-w-0">
          <SessionControls />
          <SyncStatusChip />
          <CommandPalette />
          <ThemeControl />
        </div>
      </header>

      {/* Main Container with Sidebar + Content */}
      <div className={`shell-layout flex-1 flex flex-col lg:flex-row min-h-0 w-full max-w-full ${collapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Navigation: Horizontal on mobile, vertical sidebar on lg */}
        <nav
          aria-label="Main Navigation"
          className={`hidden lg:flex border-r bg-card/40 transition-all duration-200 shrink-0 ${
            collapsed ? 'w-16' : 'w-56'
          } flex-col justify-between p-3 gap-1 select-custom-scroll`}
        >
          <div className="flex flex-row lg:flex-col items-center lg:items-stretch gap-1 w-full">
            <button
              aria-label="Toggle sidebar"
              aria-expanded={!collapsed}
              onClick={() => setCollapsed(!collapsed)}
              className="hidden lg:flex items-center justify-center p-2 mb-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground text-xs font-medium transition-colors cursor-pointer"
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
              const item = (
                <Link
                  key={p.name}
                  to={{ pathname: path, search: location.search }}
                  title={p.name}
                  aria-label={p.name}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex items-center gap-2 lg:gap-3 px-3 py-2 min-h-[44px] shrink-0 rounded-lg text-xs lg:text-sm font-medium whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  } ${collapsed ? 'lg:justify-center lg:px-2' : ''}`}
                >
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r bg-primary-foreground/80"
                    />
                  )}
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className={collapsed ? 'lg:hidden' : ''}>{p.name}</span>
                </Link>
              );
              if (collapsed) {
                return (
                  <Tooltip key={p.name}>
                    <TooltipTrigger asChild>{item}</TooltipTrigger>
                    <TooltipContent side="right">{p.name}</TooltipContent>
                  </Tooltip>
                );
              }
              return item;
            })}
          </div>

          {/* Secondary Links (dev only) */}
          {import.meta.env.DEV && (
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
          )}
        </nav>

        {/* Content Area */}
        <div className="shell-content flex-1 min-w-0 max-w-[1440px] mx-auto w-full flex flex-col px-4 sm:px-6 lg:px-8 py-6 space-y-5 overflow-x-hidden">
          <AccessBanners />
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

          {accounts.data?.length === 0 ? null : metadata.isError ? (
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

          {accounts.data?.length !== 0 && health.data && (!health.data.history_complete || !health.data.details_complete) && (
            <p
              className="partial rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2"
              role="status"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>Some API-visible history or order details are incomplete for this account scope.</span>
            </p>
          )}

          {/* Routes */}
          <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 max-w-full focus:outline-none">
            {accounts.data?.length !== 0 && <Suspense fallback={<PageSkeleton />}>
              <Routes>
                <Route path="/" element={<Overview />} />
                <Route path="/spending" element={<AnalyticsPage page="Spending" />} />
                <Route path="/food" element={<AnalyticsPage page="Food" />} />
                <Route path="/habits" element={<AnalyticsPage page="Habits" />} />
                <Route path="/orders" element={<Orders />} />
                <Route path="/behavior" element={<Navigate to={`/habits${location.search}`} replace />} />
                <Route path="/places" element={<Navigate to={`/habits${location.search}`} replace />} />
                <Route path="/ledger" element={<Navigate to={`/orders${location.search}`} replace />} />
                <Route path="/data-health" element={<Navigate to={`/?sync=open`} replace />} />
                {import.meta.env.DEV && <Route path="/design-system" element={<DesignSystem />} />}
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>}
          </main>

          <footer className="border-t pt-3 text-center text-xs text-muted-foreground">
            Food orders only; Instamart/Dineout excluded; API-visible history only. Saved details are snapshots; later
            refunds or status changes may be missing.
          </footer>
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}

export function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === "food-khata-auth-change") window.location.replace(safeReturnPath(window.location.pathname)); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  if (["/welcome", "/setup", "/login", "/register", "/home", "/accounts", "/accounts/link", "/sync", "/settings"].includes(pathname)) return <AccessRoutes />;
  return <RequireAuth><FilterProvider><Shell /></FilterProvider></RequireAuth>;
}
