import { useState, useEffect, lazy, Suspense } from 'react';
import { CommandPalette } from './CommandPalette';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Skeleton } from '../components/ui/skeleton';

const Overview = lazy(() => import('./Overview'));
const AnalyticsPage = lazy(() =>
  import('./AnalyticsPages').then((m) => ({ default: m.AnalyticsPage })),
);
const Orders = lazy(() => import('./Orders').then((m) => ({ default: m.Orders })));
const DataHealth = lazy(() => import('./DataHealth'));
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';
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
  MapPin,
  HeartPulse,
  Settings as SettingsIcon,
  Ellipsis,
} from 'lucide-react';
import '../styles/app.css';
import AccessRoutes from '../features/access/routes';
import { RequireAuth, safeReturnPath } from '../features/access/auth';
import { AccessBanners } from '../features/access/banners/AccessBanners';
import { SessionControls } from '../features/access/banners/SessionControls';
import { useAccounts } from '../features/access/api';

// bare: the page lives outside the filtered dashboard shell, so links drop the filter query.
const pages: { name: string; path: string; icon: typeof Clock; bare?: boolean }[] = [
  { name: 'Overview', path: '/', icon: LayoutDashboard },
  { name: 'Spending', path: '/spending', icon: TrendingUp },
  { name: 'Food', path: '/food', icon: Utensils },
  { name: 'Habits', path: '/habits', icon: Clock },
  { name: 'Places', path: '/places', icon: MapPin },
  { name: 'Orders', path: '/orders', icon: Receipt },
  { name: 'Data health', path: '/data-health', icon: HeartPulse },
  { name: 'Settings', path: '/settings', icon: SettingsIcon, bare: true },
];
const tabs = pages.slice(0, 4); // bottom tab bar; everything else sits behind More

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

  if (accounts.data?.length === 0) return <Navigate to="/home" replace />; // no data yet: Home is the hub

  return (
    <TooltipProvider>
    <div className="v2 min-h-screen bg-background text-foreground flex flex-col font-sans max-w-full overflow-x-hidden pb-16 lg:pb-0">
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
            <SheetContent side="left" className="w-64 p-4 bg-card">
              <SheetHeader className="pb-3 border-b text-left">
                <SheetTitle className="text-base font-bold text-foreground flex items-center gap-2">
                  <UtensilsCrossed className="h-4 w-4 text-primary" />
                  <span>Food Khata</span>
                </SheetTitle>
              </SheetHeader>
              <nav aria-label="Mobile drawer navigation" className="flex flex-col gap-1.5 py-4">
                {pages.map((p) => {
                  const path = p.path;
                  const active = location.pathname === path;
                  const Icon = p.icon;
                  return (
                    <Link
                      key={p.name}
                      to={{ pathname: path, search: p.bare ? '' : location.search }}
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
          <Link to="/" className="brand leading-none">
            <span className="font-bold text-sm sm:text-base tracking-tight text-foreground block">Food Khata</span>
            <span className="text-xs text-muted-foreground font-normal hidden sm:block mt-0.5">Your food story</span>
          </Link>
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

            {pages.map((p) => {
              const path = p.path;
              const active = location.pathname === path;
              const Icon = p.icon;
              const item = (
                <Link
                  key={p.name}
                  to={{ pathname: path, search: p.bare ? '' : location.search }}
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

          {accounts.data?.length !== 0 && health.data && location.pathname !== '/data-health' && (() => {
            const incomplete = !health.data.history_complete || !health.data.details_complete;
            const anomalies = (health.data.reconciliation_anomalies ?? 0) + (health.data.quarantined_orders ?? 0);
            if (!incomplete && !anomalies) return null;
            return (
              <p
                className="partial rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 flex flex-wrap items-center gap-2"
                role="status"
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  {incomplete ? 'Some API-visible history or order details are incomplete for this account scope. ' : ''}
                  {anomalies ? `${anomalies} order${anomalies === 1 ? '' : 's'} need review (totals that do not reconcile or records set aside). ` : ''}
                </span>
                <Link to={{ pathname: '/data-health', search: location.search }} className="underline font-medium">View Data health</Link>
              </p>
            );
          })()}

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
                <Route path="/places" element={<AnalyticsPage page="Places" />} />
                <Route path="/ledger" element={<Navigate to={`/orders${location.search}`} replace />} />
                <Route path="/data-health" element={<DataHealth />} />
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

      <nav
        aria-label="Mobile tabs"
        className="lg:hidden fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        {tabs.map((p) => {
          const active = location.pathname === p.path;
          const Icon = p.icon;
          return (
            <Link
              key={p.name}
              to={{ pathname: p.path, search: location.search }}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                active ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {p.name}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-haspopup="dialog"
          className="flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs font-medium text-muted-foreground"
        >
          <Ellipsis className="h-5 w-5" aria-hidden="true" />
          More
        </button>
      </nav>
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
  if (["/welcome", "/setup", "/login", "/register", "/home", "/accounts", "/accounts/link", "/account/password", "/sync", "/settings"].includes(pathname) || pathname.startsWith("/jobs")) return <AccessRoutes />;
  return <RequireAuth><FilterProvider><Shell /></FilterProvider></RequireAuth>;
}
