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
import { NAV_GROUPS, NAV_ITEMS, isDashboardPath, isNavActive, type NavItem } from './nav';
import { InsecureNotice } from './InsecureNotice';
import {
  Palette,
  ChevronLeft,
  ChevronRight,
  UtensilsCrossed,
  AlertCircle,
  CheckCircle2,
  Search,
  Ellipsis,
  Loader2,
} from 'lucide-react';
import '../styles/app.css';
import AccessRoutes from '../features/access/routes';
import { RequireAuth, safeReturnPath } from '../features/access/auth';
import { useTheme } from './theme';
import { AuthedPages, PUBLIC_PATHS } from '../features/access/routes';
const { Home: HomePage, LinkAccount, Sync: SyncPage, Jobs: JobsPage, Settings: SettingsPage, Password: PasswordPage } = AuthedPages;
import { AccessBanners } from '../features/access/banners/AccessBanners';
import { SessionControls } from '../features/access/banners/SessionControls';
import { useAccounts } from '../features/access/api';
import { useSyncJobs } from '../hooks/api';
import { isSyncActive, jobLabel } from '../features/access/sync/api';
import { EmptyState } from '../components/dashboard/EmptyState';
import { pluralize } from '../lib/format';

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
        const active = isNavActive(item, location.pathname);
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
                ? 'bg-primary text-primary-foreground font-semibold'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            } ${collapsed ? 'md:justify-center md:px-2' : ''}`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className={collapsed ? 'md:hidden' : ''}>{item.label}</span>
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

// A top bar marks the active tab, so it never depends on colour alone (Slate accent included).
const TAB = 'flex min-h-[56px] flex-col items-center justify-center gap-0.5 border-t-2 text-xs';
const TAB_ON = 'border-primary font-semibold text-foreground';
const TAB_OFF = 'border-transparent font-medium text-muted-foreground';
const TAB_COUNT = 4; // Overview, Spending, Food, Habits get bottom tabs; the rest sit behind More

function NavGroups({ items, collapsed = false, onNavigate }: { items: NavItem[]; collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <>
      {NAV_GROUPS.map(g => {
        const inGroup = items.filter(i => i.group === g.id);
        if (!inGroup.length) return null;
        return (
          <div key={g.id} role="group" aria-label={g.label} className="flex flex-col gap-1">
            <p className={`px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${collapsed ? 'md:hidden' : ''}`}>{g.label}</p>
            {collapsed && <div className="hidden md:block my-1 border-t" />}
            <NavLinks items={inGroup} collapsed={collapsed} onNavigate={onNavigate} />
          </div>
        );
      })}
    </>
  );
}

/** Shown in the header whenever a sync is queued, running or waiting for a code; links to that job. */
function RunningJobBadge() {
  const jobs = useSyncJobs();
  const job = jobs.data?.find(j => j.status === 'running') ?? jobs.data?.find(isSyncActive);
  if (!job) return null;
  const text = job.status === 'running' ? 'Syncing' : jobLabel(job.status);
  return (
    <Link
      to={`/jobs/${encodeURIComponent(job.id)}`}
      aria-label={`${text}: open sync job`}
      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 px-2.5 text-xs font-medium text-foreground hover:bg-primary/15"
    >
      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none text-primary" aria-hidden="true" />
      <span className="hidden sm:inline capitalize">{text}</span>
    </Link>
  );
}

/** Analytics pages with nothing to analyse: one message and one action, still inside the shell. */
function NoDataState({ hasAccounts }: { hasAccounts: boolean }) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
      <EmptyState
        title={hasAccounts ? 'No orders yet' : 'No account linked yet'}
        description={hasAccounts ? 'Sync your linked account to fetch your order history.' : 'Link a Zomato or Swiggy account to see your orders here.'}
      />
      <Link
        to={hasAccounts ? '/sync' : '/accounts/link'}
        className="inline-flex min-h-[44px] items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        {hasAccounts ? 'Sync orders' : 'Link an account'}
      </Link>
    </section>
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

  const noData = dashboard && accounts.data !== undefined && accounts.data.reduce((n, a) => n + a.order_count, 0) === 0;
  const moreItems = NAV_ITEMS.slice(TAB_COUNT);
  const moreActive = moreItems.some(i => isNavActive(i, location.pathname));

  return (
    <TooltipProvider>
    <div className="v2 min-h-screen bg-background text-foreground flex flex-col font-sans max-w-full overflow-x-hidden pb-16 md:pb-0">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md font-semibold text-sm min-h-[44px] inline-flex items-center"
      >
        Skip to main content
      </a>

      {/* One row at every width: menu (compact), brand, account, theme. */}
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-card/95 px-3 sm:px-6 py-2 backdrop-blur">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-72 p-4 bg-card flex flex-col md:hidden">
            <SheetHeader className="pb-3 border-b text-left">
              <SheetTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <UtensilsCrossed className="h-4 w-4 text-primary" />
                <span>More</span>
              </SheetTitle>
            </SheetHeader>
            <nav aria-label="More destinations" className="flex flex-col gap-1 py-1 overflow-y-auto">
              <NavGroups items={moreItems} onNavigate={() => setMobileOpen(false)} />
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

        <div className="flex-1 min-w-0 flex justify-start md:pl-6">
          <AccountSelector asLink={!dashboard} />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <RunningJobBadge />
          <SyncStatusChip />
          <div className="hidden md:flex items-center gap-2">
            <SessionControls />
          </div>
          <CommandPalette />
          <ThemeControl />
        </div>
      </header>

      <div className={`shell-layout flex-1 flex flex-col md:flex-row min-h-0 w-full max-w-full ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <nav
          aria-label="Main navigation"
          className={`hidden md:flex border-r bg-card/40 shrink-0 flex-col justify-between p-3 gap-1 transition-[width] duration-200 ${
            collapsed ? 'w-16' : 'w-56'
          }`}
        >
          <div className="flex flex-col gap-1 overflow-y-auto">
            <NavGroups items={NAV_ITEMS} collapsed={collapsed} />
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

          {!dashboard || noData ? null : metadata.isError ? (
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

          {dashboard && !noData && health.data && location.pathname !== '/data-health' && (() => {
            const incomplete = !health.data.history_complete || !health.data.details_complete;
            const review = health.data.needs_review_orders ?? 0;
            const setAside = health.data.quarantined_orders ?? 0;
            if (!incomplete && !review && !setAside) return null;
            return (
              <p className="partial notice notice-warning" role="status">
                <AlertCircle aria-hidden="true" />
                <span>
                  {incomplete ? 'Some history or order details are missing for these accounts, so totals may be low. ' : ''}
                  {review ? `${pluralize(review, 'order')} ${review === 1 ? 'needs' : 'need'} review (unverified, or totals that do not reconcile). ` : ''}
                  {setAside ? `${pluralize(setAside, 'record')} set aside because ${setAside === 1 ? 'it' : 'they'} could not be read. ` : ''}
                  <Link to={{ pathname: '/data-health', search: location.search }} className="underline font-medium">View Data health</Link>
                </span>
              </p>
            );
          })()}

          <main id="main-content" key={`${theme.isDark}-${theme.accent}-${theme.patterns}`} tabIndex={-1} className="flex-1 min-w-0 max-w-full focus:outline-none">
            <Suspense fallback={<PageSkeleton />}>
              {noData ? <NoDataState hasAccounts={(accounts.data?.length ?? 0) > 0} /> : (
              <Routes>
                <Route path="/" element={<Overview />} />
                <Route path="/spending" element={<AnalyticsPage page="Spending" />} />
                <Route path="/food" element={<AnalyticsPage page="Food" />} />
                <Route path="/habits" element={<AnalyticsPage page="Habits" />} />
                <Route path="/orders" element={<Orders />} />
                <Route path="/accounts" element={<HomePage />} />
                <Route path="/home" element={<Navigate to={`/accounts${location.search}`} replace />} />
                <Route path="/accounts/link" element={<LinkAccount />} />
                <Route path="/account/password" element={<PasswordPage />} />
                <Route path="/sync" element={<SyncPage />} />
                <Route path="/jobs" element={<JobsPage />} />
                <Route path="/jobs/:jobId" element={<JobsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/behavior" element={<Navigate to={`/habits${location.search}`} replace />} />
                <Route path="/places" element={<AnalyticsPage page="Places" />} />
                <Route path="/ledger" element={<Navigate to={`/orders${location.search}`} replace />} />
                <Route path="/data-health" element={<DataHealth />} />
                {import.meta.env.DEV && <Route path="/design-system" element={<DesignSystem />} />}
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
              )}
            </Suspense>
          </main>

          <footer className="border-t pt-3 text-center text-xs text-muted-foreground">
            Food orders only. Instamart and Dineout are excluded, and only history the apps expose is shown. Saved details are
            snapshots, so later refunds or status changes may be missing.
          </footer>
        </div>
      </div>

      <nav
        aria-label="Mobile tabs"
        className="md:hidden fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        {NAV_ITEMS.slice(0, TAB_COUNT).map((p) => {
          const active = isNavActive(p, location.pathname);
          const Icon = p.icon;
          return (
            <Link
              key={p.to}
              to={{ pathname: p.to, search: isDashboardPath(p.to) ? location.search : '' }}
              aria-current={active ? 'page' : undefined}
              className={`${TAB} ${active ? TAB_ON : TAB_OFF}`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {p.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-haspopup="dialog"
          aria-current={moreActive ? 'page' : undefined}
          className={`${TAB} ${moreActive ? TAB_ON : TAB_OFF}`}
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
  if (PUBLIC_PATHS.includes(pathname)) return <AccessRoutes />;
  return <RequireAuth><FilterProvider><Shell /></FilterProvider></RequireAuth>;
}
