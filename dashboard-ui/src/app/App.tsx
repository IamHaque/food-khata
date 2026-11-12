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
import { NAV_ITEMS, isDashboardPath, type NavItem } from './nav';
import { InsecureNotice } from './InsecureNotice';
import {
  Palette,
  ChevronLeft,
  ChevronRight,
  UtensilsCrossed,
  AlertCircle,
  CheckCircle2,
  Menu,
  Search,
} from 'lucide-react';
import '../styles/app.css';
import AccessRoutes from '../features/access/routes';
import { RequireAuth, safeReturnPath } from '../features/access/auth';
import { useTheme } from './theme';
import { InAppShell } from '../features/access/primitives/AuthShell';
import { AuthedPages } from '../features/access/routes';
const { Home: HomePage, LinkAccount, Sync: SyncPage, Settings: SettingsPage, Password: PasswordPage } = AuthedPages;
import { AccessBanners } from '../features/access/banners/AccessBanners';
import { SessionControls } from '../features/access/banners/SessionControls';
import { useAccounts } from '../features/access/api';

export function NotFoundPage() {
  const location = useLocation();
  return (
    <div className="p-8 text-center space-y-3">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-sm text-muted-foreground mt-2">
        The page you're looking for doesn't exist or has moved.
      </p>
      <Link to={{ pathname: '/', search: location.search }} className="inline-flex items-center rounded-md border border-input bg-background px-3 min-h-[44px] text-sm font-medium hover:bg-accent">
        Back to Overview
      </Link>
    </div>
  );
}

function NavLinks({
  items,
  collapsed = false,
  onNavigate,
}: {
  items: NavItem[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  return (
    <>
      {items.map(item => {
        const active = location.pathname === item.to;
        const Icon = item.icon;
        const link = (
          <Link
            key={item.to}
            to={{ pathname: item.to, search: isDashboardPath(item.to) ? location.search : '' }}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            aria-label={collapsed ? item.label : undefined}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 min-h-[44px] text-sm font-medium whitespace-nowrap transition-colors ${
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            } ${collapsed ? 'lg:justify-center lg:px-2' : ''}`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className={collapsed ? 'lg:hidden' : ''}>{item.label}</span>
          </Link>
        );
        return collapsed ? (
          <Tooltip key={item.to}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        ) : (
          link
        );
      })}
    </>
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
  const dashboard = isDashboardPath(location.pathname);
  const theme = useTheme();

  if (accounts.data?.length === 0 && dashboard) return <Navigate to="/home" replace />; // no data yet: Accounts is the hub

  const analytics = NAV_ITEMS.filter(i => i.group === 'analytics');
  const manage = NAV_ITEMS.filter(i => i.group === 'manage');

  return (
    <TooltipProvider>
    <InAppShell.Provider value>
    <div className="v2 min-h-screen bg-background text-foreground flex flex-col font-sans max-w-full overflow-x-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md font-semibold text-sm min-h-[44px] inline-flex items-center"
      >
        Skip to main content
      </a>

      {/* One row at every width: menu (compact), brand, account, theme. */}
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-card/95 px-3 sm:px-6 py-2 backdrop-blur">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Open menu"
              className="lg:hidden inline-flex items-center justify-center rounded-md border border-input bg-background min-h-[44px] min-w-[44px] text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              <Menu className="h-5 w-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-4 bg-card flex flex-col">
            <SheetHeader className="pb-3 border-b text-left">
              <SheetTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <UtensilsCrossed className="h-4 w-4 text-primary" />
                <span>Food Khata</span>
              </SheetTitle>
            </SheetHeader>
            <nav aria-label="Menu" className="flex flex-col gap-1 py-3">
              <NavLinks items={analytics} onNavigate={() => setMobileOpen(false)} />
              <div className="my-2 border-t" />
              <NavLinks items={manage} onNavigate={() => setMobileOpen(false)} />
            </nav>
            <div className="mt-auto space-y-2 border-t pt-3">
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  window.dispatchEvent(new Event('food-khata-open-palette'));
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent min-h-[44px]"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                Commands
              </button>
              <div className="px-1"><SyncStatusChip /></div>
              <SessionControls variant="menu" />
            </div>
          </SheetContent>
        </Sheet>

        <Link to="/" className="flex items-center gap-2 shrink-0 rounded-md" aria-label="Food Khata home">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <UtensilsCrossed className="h-4 w-4" />
          </span>
          <span className="hidden min-[420px]:block font-semibold text-base tracking-tight">Food Khata</span>
        </Link>

        <div className="flex-1 min-w-0 flex justify-center lg:justify-start lg:pl-6">
          <AccountSelector />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden lg:flex items-center gap-2">
            <SyncStatusChip />
            <SessionControls />
          </div>
          <CommandPalette />
          <ThemeControl />
        </div>
      </header>

      <div className={`shell-layout flex-1 flex flex-col lg:flex-row min-h-0 w-full max-w-full ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <nav
          aria-label="Main navigation"
          className={`hidden lg:flex border-r bg-card/40 shrink-0 flex-col justify-between p-3 gap-1 transition-[width] duration-200 ${
            collapsed ? 'w-16' : 'w-56'
          }`}
        >
          <div className="flex flex-col gap-1">
            <NavLinks items={analytics} collapsed={collapsed} />
            <div className="my-2 border-t" />
            <NavLinks items={manage} collapsed={collapsed} />
          </div>
          <div className="space-y-1">
            {import.meta.env.DEV && (
              <Link
                to="/design-system"
                className={`flex items-center gap-3 rounded-lg px-3 min-h-[36px] text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground ${collapsed ? 'justify-center px-2' : ''}`}
              >
                <Palette className="h-3.5 w-3.5 shrink-0" />
                {!collapsed && <span>Design system</span>}
              </Link>
            )}
            <button
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed(!collapsed)}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-3 min-h-[36px] text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {collapsed ? <ChevronRight className="h-4 w-4 mx-auto" /> : (<><span>Collapse navigation</span><ChevronLeft className="h-4 w-4" /></>)}
            </button>
          </div>
        </nav>

        <div className="shell-content flex-1 min-w-0 max-w-[1440px] mx-auto w-full flex flex-col px-4 sm:px-6 lg:px-8 py-5 gap-4 overflow-x-hidden">
          <InsecureNotice />
          <AccessBanners />
          {notice && (
            <p role="status" aria-live="polite" className="notice notice-success">
              <CheckCircle2 aria-hidden="true" />
              <span>{notice}</span>
            </p>
          )}

          {!dashboard || accounts.data?.length === 0 ? null : metadata.isError ? (
            <div role="alert" className="notice notice-danger items-center justify-between">
              <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />Filter options could not load. Check your connection, then try again.</span>
              <button className="rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent min-h-[36px]" onClick={() => void metadata.refetch()}>
                Retry
              </button>
            </div>
          ) : metadata.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">Loading filters…</p>
          ) : (
            <FilterBar />
          )}

          {dashboard && accounts.data?.length !== 0 && health.data && (!health.data.history_complete || !health.data.details_complete) && (
            <p className="partial notice notice-warning" role="status">
              <AlertCircle aria-hidden="true" />
              <span>Some history or order details are missing for these accounts, so totals may be low.</span>
            </p>
          )}

          <main id="main-content" key={`${theme.isDark}-${theme.accent}-${theme.patterns}`} tabIndex={-1} className="flex-1 min-w-0 max-w-full focus:outline-none">
            <Suspense fallback={<PageSkeleton />}>
              <Routes>
                <Route path="/" element={<Overview />} />
                <Route path="/spending" element={<AnalyticsPage page="Spending" />} />
                <Route path="/food" element={<AnalyticsPage page="Food" />} />
                <Route path="/habits" element={<AnalyticsPage page="Habits" />} />
                <Route path="/orders" element={<Orders />} />
                <Route path="/home" element={<HomePage />} />
                <Route path="/accounts" element={<Navigate to="/home" replace />} />
                <Route path="/accounts/link" element={<LinkAccount />} />
                <Route path="/account/password" element={<PasswordPage />} />
                <Route path="/sync" element={<SyncPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/behavior" element={<Navigate to={`/habits${location.search}`} replace />} />
                <Route path="/places" element={<Navigate to={`/habits${location.search}`} replace />} />
                <Route path="/ledger" element={<Navigate to={`/orders${location.search}`} replace />} />
                <Route path="/data-health" element={<Navigate to={`/?sync=open`} replace />} />
                {import.meta.env.DEV && <Route path="/design-system" element={<DesignSystem />} />}
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </main>

          <footer className="border-t pt-3 text-center text-xs text-muted-foreground">
            Food orders only. Instamart and Dineout are excluded, and only history the apps expose is shown. Saved details are
            snapshots, so later refunds or status changes may be missing.
          </footer>
        </div>
      </div>
    </div>
    </InAppShell.Provider>
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
  if (["/welcome", "/setup", "/login", "/register"].includes(pathname)) return <AccessRoutes />;
  return <RequireAuth><FilterProvider><Shell /></FilterProvider></RequireAuth>;
}
