import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type VisibilityState,
  type OnChangeFn,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { Chip } from '../components/ui/chip';
import { EmptyState } from '../components/dashboard/EmptyState';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover';
import { SegmentedControl, type SegmentedControlOption } from '../components/ui/segmented-control';
import {
  loadTablePrefs,
  saveTablePrefs,
  type TableDensity,
} from '../lib/table-prefs';
import { useOrders } from '../hooks/api';
import { useFilters } from './FilterContext';
import { exportLedger } from '../lib/ledger';
import type { OrdersParams } from '../lib/api';
export { exportLedger } from '../lib/ledger';
import { OrderModal } from './OrderModal';
import type { components } from '../types/api';
import {
  loadSavedViews,
  saveView,
  deleteView,
  renameView,
  type SavedView,
} from '../lib/saved-views';
import {
  Download,
  SlidersHorizontal,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  XCircle,
  Eye,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Receipt,
  Search,
  X,
} from 'lucide-react';

export type Order = components['schemas']['Order'];

export type OrderVerificationStatus = 'verified' | 'unverified' | 'unbalanced';

export const money = (n: number | null | undefined): string =>
  n == null
    ? 'Unknown'
    : new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2,
      }).format(n);

export function formatOrderDate(val: string | null | undefined): string {
  if (!val) return '—';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val).slice(0, 10);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function getOrderVerificationStatus(order: {
  financial_verified?: boolean | null;
  reconciliation_difference?: number | null;
  status?: string | null;
  verification_status?: string | null;
}): OrderVerificationStatus {
  if (
    order.status === 'verified' ||
    order.status === 'unverified' ||
    order.status === 'unbalanced'
  ) {
    return order.status;
  }
  if (
    order.verification_status === 'verified' ||
    order.verification_status === 'unverified' ||
    order.verification_status === 'unbalanced'
  ) {
    return order.verification_status;
  }
  if (order.financial_verified) {
    return 'verified';
  }
  if (
    order.reconciliation_difference != null &&
    Math.abs(order.reconciliation_difference) > 1
  ) {
    return 'unbalanced';
  }
  return 'unverified';
}

export function OrderStatusChip({ status }: { status: OrderVerificationStatus }) {
  if (status === 'verified') {
    return (
      <Chip
        label="Verified"
        icon={<CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />}
        className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 font-medium"
        data-status="verified"
      />
    );
  }
  if (status === 'unbalanced') {
    return (
      <Chip
        label="Unbalanced"
        icon={<AlertTriangle className="h-3 w-3 text-rose-600 dark:text-rose-400" />}
        className="bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20 font-medium"
        data-status="unbalanced"
      />
    );
  }
  return (
    <Chip
      label="Unverified"
      icon={<HelpCircle className="h-3 w-3 text-amber-600 dark:text-amber-400" />}
      className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20 font-medium"
      data-status="unverified"
    />
  );
}

export function OrderAmountCell({
  amount,
  maxAmount,
}: {
  amount: number | null | undefined;
  maxAmount: number;
}) {
  const val = amount ?? 0;
  const safeMax = Math.max(maxAmount, 1);
  const pct = Math.min(Math.max((val / safeMax) * 100, 0), 100);

  return (
    <div className="flex flex-col items-end gap-1 min-w-[90px]" data-testid="amount-cell">
      <span className="font-mono text-xs font-semibold text-foreground">
        {money(amount)}
      </span>
      <div
        className="h-1.5 w-16 bg-muted/70 rounded-full overflow-hidden"
        title={`${money(amount)} (${Math.round(pct)}% of max ${money(safeMax)})`}
        data-testid="amount-bar-container"
      >
        <div
          className="h-full bg-primary/70 rounded-full transition-all"
          style={{ width: `${pct}%` }}
          data-testid="amount-bar"
          role="progressbar"
          aria-valuenow={val}
          aria-valuemin={0}
          aria-valuemax={safeMax}
        />
      </div>
    </div>
  );
}

export function PlatformBadge({ platform }: { platform: string }) {
  const isSwiggy = platform.toUpperCase() === 'SWIGGY';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tracking-wide uppercase border ${
        isSwiggy
          ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20'
          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
      }`}
      data-platform={platform}
    >
      {platform}
    </span>
  );
}

export function HighlightText({
  text,
  query,
}: {
  text: string | null | undefined;
  query?: string | null;
}) {
  if (!text) return null;
  const q = query?.trim();
  if (!q) return <>{text}</>;

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  if (parts.length === 1) return <>{text}</>;

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark
            key={i}
            className="bg-amber-200/60 dark:bg-amber-900/50 text-inherit rounded-xs px-0.5"
          >
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function debounceSearch(
  fn: (search: string | null) => void,
  delayMs = 250,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = (query: string) => {
    if (timer) clearTimeout(timer);
    const trimmed = query.trim();
    const nextSearch = trimmed || null;
    timer = setTimeout(() => {
      fn(nextSearch);
    }, delayMs);
  };
  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return { debounced, cancel };
}

export function useDebouncedSearch(
  filterSearch: string | null | undefined,
  onSearchChange: (search: string | null) => void,
  delayMs = 250,
) {
  const [searchQuery, setSearchQuery] = useState(filterSearch ?? '');
  const lastSyncedSearch = useRef(filterSearch);

  useEffect(() => {
    if (filterSearch !== lastSyncedSearch.current) {
      lastSyncedSearch.current = filterSearch;
      setSearchQuery(filterSearch ?? '');
    }
  }, [filterSearch]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    const nextSearch = trimmed || null;

    if (nextSearch === (filterSearch ?? null)) {
      return;
    }

    const timer = setTimeout(() => {
      lastSyncedSearch.current = nextSearch;
      onSearchChange(nextSearch);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [searchQuery, filterSearch, onSearchChange, delayMs]);

  const clearSearch = () => {
    setSearchQuery('');
    lastSyncedSearch.current = null;
    onSearchChange(null);
  };

  return {
    searchQuery,
    setSearchQuery,
    clearSearch,
  };
}

export function OrderSearchInput({
  value,
  onChange,
  onClear,
}: {
  value: string;
  onChange: (val: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="relative flex-1 min-w-[240px] max-w-sm">
      <label htmlFor="orders-search" className="sr-only">
        Search orders
      </label>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        id="orders-search"
        type="text"
        role="searchbox"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape' && value) {
            e.stopPropagation();
            onClear();
          }
        }}
        placeholder="Search orders, restaurants, items…"
        aria-label="Search orders"
        className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-8 text-xs text-foreground placeholder:text-muted-foreground shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      {value ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground rounded-full cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function QuickFilterChips({
  platforms = ['SWIGGY', 'ZOMATO'],
  activePlatforms = [],
  verifiedOnly = false,
  anomaly = 'all',
  onTogglePlatform,
  onToggleVerified,
  onToggleAnomaly,
}: {
  platforms?: string[];
  activePlatforms?: string[];
  verifiedOnly?: boolean;
  anomaly?: string;
  onTogglePlatform: (platform: string) => void;
  onToggleVerified: () => void;
  onToggleAnomaly: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Quick filters">
      <span className="text-xs font-medium text-muted-foreground mr-1">Platform</span>
      {platforms.map(platform => {
        const isActive = activePlatforms.includes(platform);
        const label =
          platform.toUpperCase() === 'SWIGGY'
            ? 'Swiggy'
            : platform.toUpperCase() === 'ZOMATO'
            ? 'Zomato'
            : platform;
        return (
          <button
            key={platform}
            type="button"
            aria-pressed={isActive}
            data-active={isActive}
            data-platform={platform}
            onClick={() => onTogglePlatform(platform)}
            className={`min-h-[36px] inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors cursor-pointer select-none ${
              isActive
                ? 'bg-primary text-primary-foreground border-primary font-semibold'
                : 'border-input bg-background hover:bg-accent text-foreground'
            }`}
          >
            <span>{label}</span>
          </button>
        );
      })}

      <button
        type="button"
        aria-pressed={verifiedOnly}
        data-active={verifiedOnly}
        onClick={onToggleVerified}
        className={`min-h-[36px] inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors cursor-pointer select-none ${
          verifiedOnly
            ? 'bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-700 dark:border-emerald-800 font-semibold'
            : 'border-input bg-background hover:bg-accent text-foreground'
        }`}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        <span>Verified</span>
      </button>

      <button
        type="button"
        aria-pressed={anomaly === 'review'}
        data-active={anomaly === 'review'}
        onClick={onToggleAnomaly}
        title="Review unverified or unbalanced bills"
        className={`min-h-[36px] inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors cursor-pointer select-none ${
          anomaly === 'review'
            ? 'bg-amber-600 text-white border-amber-700 dark:bg-amber-700 dark:border-amber-800 font-semibold'
            : 'border-input bg-background hover:bg-accent text-foreground'
        }`}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        <span>Needs review</span>
      </button>
    </div>
  );
}

export const sortKeys = ['date', 'restaurant', 'platform', 'status', 'discount', 'fees', 'amount'];

export interface ExportStatus {
  type: 'success' | 'cancelled' | 'error';
  message: string;
}

export function ExportFeedback({
  exporting,
  exportStatus,
}: {
  exporting: boolean;
  exportStatus: ExportStatus | null;
}) {
  if (exporting) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="export-progress"
        className="p-3 rounded-lg border border-blue-500/20 bg-blue-500/10 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2"
      >
        <div
          className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0"
          aria-hidden="true"
        />
        <span>Exporting orders...</span>
      </div>
    );
  }

  if (!exportStatus) {
    return null;
  }

  return (
    <div
      role={exportStatus.type === 'error' ? 'alert' : 'status'}
      aria-live={exportStatus.type === 'error' ? 'assertive' : 'polite'}
      data-testid="export-feedback"
      className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
        exportStatus.type === 'success'
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
          : exportStatus.type === 'cancelled'
          ? 'bg-muted border-border text-muted-foreground'
          : 'bg-destructive/10 border-destructive/20 text-destructive'
      }`}
    >
      {exportStatus.type === 'success' ? (
        <CheckCircle2 className="h-4 w-4 shrink-0" />
      ) : exportStatus.type === 'cancelled' ? (
        <XCircle className="h-4 w-4 shrink-0" />
      ) : (
        <AlertTriangle className="h-4 w-4 shrink-0" />
      )}
      <span>{exportStatus.message}</span>
    </div>
  );
}

export async function executeExport({
  request,
  signal,
  totalCount,
  setExporting,
  setExportStatus,
  createBlobUrl = (csv: string) =>
    URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })),
  triggerDownload = (url: string) => {
    if (typeof document !== 'undefined') {
      const link = document.createElement('a');
      link.href = url;
      link.download = 'food-khata-orders.csv';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  },
}: {
  request: OrdersParams;
  signal: AbortSignal;
  totalCount?: number;
  setExporting?: (exporting: boolean) => void;
  setExportStatus?: (status: ExportStatus | null) => void;
  createBlobUrl?: (csv: string) => string;
  triggerDownload?: (url: string) => void;
}): Promise<{ ok: boolean; status: ExportStatus; csv?: string }> {
  setExporting?.(true);
  setExportStatus?.(null);
  try {
    const csv = await exportLedger(request, signal);
    const url = createBlobUrl(csv);
    triggerDownload(url);
    const countDisplay = totalCount != null ? `${totalCount}` : 'matching';
    const status: ExportStatus = {
      type: 'success',
      message: `CSV exported successfully (${countDisplay} orders).`,
    };
    setExportStatus?.(status);
    return { ok: true, status, csv };
  } catch (error) {
    const isAbort =
      (error instanceof Error && error.name === 'AbortError') || signal.aborted;
    const status: ExportStatus = isAbort
      ? { type: 'cancelled', message: 'Export was cancelled.' }
      : { type: 'error', message: 'Could not export orders. Please retry.' };
    setExportStatus?.(status);
    return { ok: false, status };
  } finally {
    setExporting?.(false);
  }
}

export const DENSITY_OPTIONS: SegmentedControlOption[] = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
];

export const PAGE_SIZE_OPTIONS: SegmentedControlOption[] = [
  { value: '25', label: '25' },
  { value: '50', label: '50' },
  { value: '100', label: '100' },
  { value: '200', label: '200' },
];
export function applySavedView(
  view: SavedView,
  actions: {
    update: (filters: Record<string, any>) => void;
    change: (params: Record<string, string>) => void;
    setVisibility?: (visibility: VisibilityState) => void;
  },
) {
  actions.update(view.filters);

  const sortPatch: Record<string, string> = { page: '1' };
  if (view.sort) sortPatch.sort = view.sort;
  if (view.direction) sortPatch.direction = view.direction;
  actions.change(sortPatch);

  if (view.columnVisibility) {
    actions.setVisibility?.(view.columnVisibility);
    saveTablePrefs({ columnVisibility: view.columnVisibility });
  }
}

export function saveCurrentView(
  name: string,
  state: {
    filters: Record<string, any>;
    sort?: string;
    direction?: string;
    columnVisibility?: Record<string, boolean>;
  },
): SavedView {
  return saveView({
    name,
    filters: state.filters,
    sort: state.sort,
    direction: state.direction,
    columnVisibility: state.columnVisibility,
  });
}

export function deleteSavedView(id: string): SavedView[] {
  return deleteView(id);
}

export interface OrdersProps {
  initialExporting?: boolean;
  initialExportStatus?: ExportStatus | null;
  initialColumnsOpen?: boolean;
  initialViewsOpen?: boolean;
}

export function Orders({
  initialExporting = false,
  initialExportStatus = null,
  initialColumnsOpen = false,
  initialViewsOpen = false,
}: OrdersProps = {}) {
  const { filters, update, clear, metadata } = useFilters();
  const [params, setParams] = useSearchParams();

  const [initialPrefs] = useState(() => loadTablePrefs());
  const [density, setDensity] = useState<TableDensity>(initialPrefs.density);
  const compact = density === 'compact';
  const [visibility, setVisibility] = useState<VisibilityState>(initialPrefs.columnVisibility);
  const [columnsOpen, setColumnsOpen] = useState(initialColumnsOpen);
  const [viewsOpen, setViewsOpen] = useState(initialViewsOpen);
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => loadSavedViews());
  const [newViewName, setNewViewName] = useState('');
  const [editingViewId, setEditingViewId] = useState<string | null>(null);
  const [editingViewName, setEditingViewName] = useState('');

  useEffect(() => {
    const prefs = loadTablePrefs();
    setDensity(prefs.density);
    setVisibility(prefs.columnVisibility);
  }, []);

  useEffect(() => {
    if (viewsOpen) {
      setSavedViews(loadSavedViews());
    }
  }, [viewsOpen]);

  useEffect(() => {
    const handleViewsSync = () => {
      setSavedViews(loadSavedViews());
    };
    const handlePrefsSync = () => {
      const prefs = loadTablePrefs();
      setVisibility(prefs.columnVisibility);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleViewsSync);
      window.addEventListener('food-khata-views-changed', handleViewsSync);
      window.addEventListener('food-khata-prefs-changed', handlePrefsSync);
      return () => {
        window.removeEventListener('storage', handleViewsSync);
        window.removeEventListener('food-khata-views-changed', handleViewsSync);
        window.removeEventListener('food-khata-prefs-changed', handlePrefsSync);
      };
    }
  }, []);

  const { searchQuery, setSearchQuery, clearSearch } = useDebouncedSearch(
    filters.search,
    search => update({ search }),
    250,
  );

  const availablePlatforms = useMemo(() => {
    const list = metadata?.data?.platforms;
    if (list && list.length > 0) return list;
    return ['SWIGGY', 'ZOMATO'];
  }, [metadata?.data?.platforms]);

  const activeSearch = (filters.search || searchQuery || '').trim();

  useEffect(() => {
    if (!params.has('statuses')) update({ statuses: [] });
  }, [params, update]);

  const rawPage = Number(params.get('page') ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const paramSize = params.get('page_size');
  const requestedSize = paramSize !== null ? Number(paramSize) : initialPrefs.pageSize;
  const pageSize = [25, 50, 100, 200].includes(requestedSize) ? requestedSize : 50;
  const requestedSort = params.get('sort') ?? 'date';
  const sort = sortKeys.includes(requestedSort) ? requestedSort : 'date';
  const direction = params.get('direction') === 'asc' ? 'asc' : 'desc';

  const request = useMemo(
    () => ({
      ...filters,
      statuses: params.has('statuses') ? filters.statuses : [],
      page,
      page_size: pageSize,
      sort,
      direction,
    }),
    [filters, params, page, pageSize, sort, direction],
  );

  const query = useOrders(request);
  const [exporting, setExporting] = useState(initialExporting);
  const [exportStatus, setExportStatus] = useState<ExportStatus | null>(initialExportStatus);
  const abort = useRef<AbortController | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scope = JSON.stringify(filters);
  useEffect(() => () => abort.current?.abort(), [scope]);

  const change = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    setParams(next);
  };

  const handlePageSizeChange = (val: string) => {
    const nextSize = Number(val);
    change({ page_size: val, page: '1' });
    saveTablePrefs({ pageSize: nextSize });
  };

  const handleDensityChange = (val: string) => {
    const nextDensity = val === 'compact' ? 'compact' : 'comfortable';
    setDensity(nextDensity);
    saveTablePrefs({ density: nextDensity });
  };

  const handleVisibilityChange: OnChangeFn<VisibilityState> = updaterOrValue => {
    setVisibility(old => {
      const next = typeof updaterOrValue === 'function' ? updaterOrValue(old) : updaterOrValue;
      saveTablePrefs({ columnVisibility: next });
      return next;
    });
  };

  const handleSaveView = () => {
    const trimmed = newViewName.trim();
    if (!trimmed) return;
    saveCurrentView(trimmed, {
      filters,
      sort,
      direction,
      columnVisibility: visibility,
    });
    setSavedViews(loadSavedViews());
    setNewViewName('');
  };

  const handleApplyView = (view: SavedView) => {
    applySavedView(view, {
      update,
      change,
      setVisibility,
    });
  };

  const handleStartRename = (view: SavedView) => {
    setEditingViewId(view.id);
    setEditingViewName(view.name);
  };

  const handleSaveRename = (id: string) => {
    renameView(id, editingViewName);
    setSavedViews(loadSavedViews());
    setEditingViewId(null);
  };

  const handleDeleteView = (id: string) => {
    deleteSavedView(id);
    setSavedViews(loadSavedViews());
    if (editingViewId === id) {
      setEditingViewId(null);
    }
  };

  const open = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('order', id);
    setParams(next);
  };

  const sortable = (id: string, label: string) => {
    const isActive = sort === id;
    return (
      <button
        type="button"
        onClick={() =>
          change({
            sort: id,
            direction: isActive && direction === 'desc' ? 'asc' : 'desc',
            page: '1',
          })
        }
        className="inline-flex items-center gap-1.5 font-semibold text-xs text-foreground hover:text-primary transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded px-1 -mx-1"
        aria-label={`Sort by ${label}${isActive ? ` (${direction})` : ''}`}
      >
        <span>{label}</span>
        <span className="text-xs text-muted-foreground inline-flex items-center" aria-hidden="true">
          {isActive ? (
            direction === 'asc' ? (
              <ArrowUp className="h-3 w-3 text-primary" data-testid="sort-asc" />
            ) : (
              <ArrowDown className="h-3 w-3 text-primary" data-testid="sort-desc" />
            )
          ) : (
            <ArrowUpDown className="h-3 w-3 opacity-40 hover:opacity-100" data-testid="sort-none" />
          )}
        </span>
      </button>
    );
  };

  const rows = useMemo(() => query.data?.rows ?? [], [query.data?.rows]);
  const maxAmount = useMemo(
    () => Math.max(...rows.map(r => r.final_amount_paid ?? 0), 1),
    [rows],
  );

  const columns: ColumnDef<Order>[] = useMemo(
    () => [
      {
        id: 'date',
        header: () => sortable('date', 'Date'),
        accessorKey: 'order_timestamp',
        cell: info => (
          <span className="font-mono text-xs whitespace-nowrap text-muted-foreground">
            {formatOrderDate(info.row.original.order_timestamp || info.row.original.order_date)}
          </span>
        ),
      },
      ...(filters.account_ids.length ? [] : [{ id: 'account', header: 'Account', accessorKey: 'account_label' }]),
      {
        id: 'platform',
        header: () => sortable('platform', 'Platform'),
        accessorKey: 'platform',
        cell: info => <PlatformBadge platform={info.row.original.platform} />,
      },
      {
        id: 'restaurant',
        header: () => sortable('restaurant', 'Restaurant'),
        accessorKey: 'restaurant_name',
        cell: info => (
          <span
            className="truncate-cell font-medium text-xs max-w-[200px] truncate block"
            title={info.row.original.restaurant_name ?? 'Unknown'}
          >
            <HighlightText
              text={info.row.original.restaurant_name ?? 'Unknown'}
              query={activeSearch}
            />
          </span>
        ),
      },
      {
        id: 'items',
        header: 'Items',
        accessorKey: 'items_summary',
        cell: info => (
          <span
            className="truncate-cell text-xs text-muted-foreground max-w-[220px] truncate block"
            title={info.row.original.items_summary ?? 'No items'}
          >
            <HighlightText
              text={info.row.original.items_summary ?? 'No items'}
              query={activeSearch}
            />
          </span>
        ),
      },
      {
        id: 'amount',
        header: () => sortable('amount', 'Amount'),
        cell: info => (
          <OrderAmountCell
            amount={info.row.original.final_amount_paid}
            maxAmount={maxAmount}
          />
        ),
      },
      {
        id: 'status',
        header: () => sortable('status', 'Status'),
        cell: info => (
          <OrderStatusChip status={getOrderVerificationStatus(info.row.original)} />
        ),
      },
      {
        id: 'discount',
        header: () => sortable('discount', 'Discount'),
        cell: info => (
          <span className="font-mono text-xs text-muted-foreground">
            {money(info.row.original.total_discount)}
          </span>
        ),
      },
      {
        id: 'fees',
        header: () => sortable('fees', 'Fees'),
        cell: info => (
          <span className="font-mono text-xs text-muted-foreground" title="Net delivery, packaging and platform fees">
            {money(info.row.original.fees)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: info => (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              open(info.row.original.id);
            }}
            className="min-h-[44px] px-2.5 py-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
            aria-label={`Inspect order ${info.row.original.platform_order_id}`}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Inspect</span>
          </button>
        ),
      },
    ],
    [filters.account_ids.length, maxAmount, sort, direction, activeSearch],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    rowCount: query.data?.total ?? 0,
    state: { columnVisibility: visibility, pagination: { pageIndex: page - 1, pageSize } },
    onColumnVisibilityChange: handleVisibilityChange,
  });

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => (compact ? 36 : 48),
    overscan: 10,
    initialRect: { width: 1000, height: 600 },
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0]?.start ?? 0 : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? totalSize - (virtualRows[virtualRows.length - 1]?.end ?? 0)
      : 0;

  async function download() {
    const controller = new AbortController();
    abort.current = controller;
    await executeExport({
      request,
      signal: controller.signal,
      totalCount: query.data?.total,
      setExporting,
      setExportStatus,
    });
  }

  const total = query.data?.total ?? 0;
  const start = total ? Math.min((page - 1) * pageSize + 1, total) : 0;
  const end = Math.min(page * pageSize, total);

  return (
    <section className="page-panel rounded-xl border bg-card p-4 sm:p-6 shadow-xs space-y-4">
      {/* Title */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Orders</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Full order history. “Verified” means known bill components balance within ₹1.
          </p>
        </div>
      </div>

      {/* Pinned controls: Search box and quick filters */}
      <div
        className="orders-pinned-controls flex flex-wrap items-center justify-between gap-3"
        data-testid="orders-pinned-controls"
      >
        <div className="flex flex-1 flex-wrap items-center gap-3 min-w-[280px]">
          <OrderSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            onClear={clearSearch}
          />
          <QuickFilterChips
            platforms={availablePlatforms}
            activePlatforms={filters.platforms}
            verifiedOnly={filters.verified_only}
            anomaly={filters.anomaly}
            onTogglePlatform={platform => {
              const current = filters.platforms;
              const next = current.includes(platform)
                ? current.filter(p => p !== platform)
                : [...current, platform];
              update({ platforms: next });
            }}
            onToggleVerified={() => update({ verified_only: !filters.verified_only })}
            onToggleAnomaly={() => update({ anomaly: filters.anomaly === 'review' ? 'all' : 'review' })}
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="orders-tools flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <span className="text-muted-foreground">Rows per page</span>
            <SegmentedControl
              aria-label="Rows per page"
              options={PAGE_SIZE_OPTIONS}
              value={String(pageSize)}
              onChange={handlePageSizeChange}
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <span className="text-muted-foreground">Density</span>
            <SegmentedControl
              aria-label="Density"
              options={DENSITY_OPTIONS}
              value={density}
              onChange={handleDensityChange}
            />
          </div>

          {/* Views Popover */}
          <Popover open={viewsOpen} onOpenChange={setViewsOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Views"
                className="cursor-pointer min-h-[36px] rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-xs hover:bg-accent text-foreground flex items-center gap-1.5 transition-colors"
              >
                <Bookmark className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Views</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-3 space-y-3" data-testid="views-popover-content">
              {/* Save current view section */}
              <div className="space-y-2 border-b pb-3">
                <span className="text-xs font-semibold text-foreground">Save current view</span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="View name"
                    aria-label="View name"
                    value={newViewName}
                    onChange={e => setNewViewName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveView();
                      }
                    }}
                    className="flex-1 rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={handleSaveView}
                    disabled={!newViewName.trim()}
                    className="cursor-pointer rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>

              {/* List of saved views */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-foreground">Saved views</span>
                {savedViews.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-1">No saved views</p>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {savedViews.map(view => (
                      <div
                        key={view.id}
                        className="flex items-center justify-between gap-2 rounded-md p-1.5 hover:bg-accent text-xs"
                        data-testid={`saved-view-item-${view.id}`}
                      >
                        {editingViewId === view.id ? (
                          <div className="flex items-center gap-1 flex-1">
                            <input
                              type="text"
                              aria-label="Rename view input"
                              value={editingViewName}
                              onChange={e => setEditingViewName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSaveRename(view.id);
                                } else if (e.key === 'Escape') {
                                  setEditingViewId(null);
                                }
                              }}
                              className="flex-1 rounded border border-input bg-background px-1.5 py-0.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveRename(view.id)}
                              className="px-1.5 py-0.5 text-xs font-medium text-primary hover:underline cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingViewId(null)}
                              className="px-1 py-0.5 text-xs text-muted-foreground hover:underline cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <span
                              className="font-medium text-foreground truncate max-w-[130px]"
                              title={view.name}
                            >
                              {view.name}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleApplyView(view)}
                                className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 cursor-pointer"
                                aria-label={`Apply ${view.name}`}
                              >
                                Apply
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStartRename(view)}
                                className="px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                                aria-label={`Rename ${view.name}`}
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteView(view.id)}
                                className="px-1.5 py-0.5 text-xs text-destructive hover:underline cursor-pointer"
                                aria-label={`Delete ${view.name}`}
                              >
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>

          <Popover open={columnsOpen} onOpenChange={setColumnsOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Columns"
                className="cursor-pointer min-h-[36px] rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-xs hover:bg-accent text-foreground flex items-center gap-1.5 transition-colors"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Columns</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-44 p-2 space-y-1">
              {table.getAllLeafColumns().map(column => (
                <label
                  className="check flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer hover:bg-accent px-1.5 py-1 rounded"
                  key={column.id}
                >
                  <input
                    type="checkbox"
                    checked={column.getIsVisible()}
                    onChange={column.getToggleVisibilityHandler()}
                    className="h-4 w-4 rounded border-input"
                  />
                  <span className="capitalize">{column.id}</span>
                </label>
              ))}
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={exporting || query.isPending || query.isError}
            onClick={() => void download()}
            className="min-h-[44px] inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-xs font-semibold shadow-xs hover:bg-accent disabled:opacity-50 text-foreground transition-colors cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Export CSV</span>
          </button>
          {exporting && (
            <button
              type="button"
              onClick={() => abort.current?.abort()}
              className="min-h-[44px] rounded-md border border-destructive/30 bg-destructive/10 text-destructive px-3 py-2 text-xs font-medium hover:bg-destructive/20 transition-colors"
            >
              Cancel export
            </button>
          )}
        </div>
      </div>

      {/* Distinct Export Feedback */}
      <ExportFeedback exporting={exporting} exportStatus={exportStatus} />

      {/* Refresh error banner when retaining prior rows */}
      {query.isError && query.data && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive flex items-center justify-between"
        >
          <span>Orders could not refresh. Displaying previously loaded data.</span>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="min-h-[36px] rounded border border-destructive/30 px-3 py-1 bg-background text-foreground shadow-xs hover:bg-accent font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {/* Initial load failure */}
      {query.isError && !query.data ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive flex items-center justify-between"
        >
          <span>Orders could not load.</span>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="min-h-[44px] rounded border px-3 py-2 bg-background text-foreground shadow-xs hover:bg-accent font-medium"
          >
            Retry
          </button>
        </div>
      ) : query.isPending ? (
        <div
          aria-busy="true"
          data-testid="orders-skeleton"
          className="orders-skeleton rounded-lg border bg-card p-4 space-y-3"
        >
          <div className="flex items-center justify-between pb-3 border-b">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 py-2 border-b last:border-b-0"
                data-testid="skeleton-row"
              >
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-48 hidden md:block" />
                <Skeleton className="h-4 w-20 ml-auto" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ) : total === 0 ? (
        <div
          className="rounded-lg border bg-card p-8 text-center space-y-4"
          data-testid="orders-empty-state"
        >
          <EmptyState
            icon={<Receipt className="h-8 w-8 text-muted-foreground/60" />}
            title="No orders match these filters"
            description="Try clearing the restaurant, search, or date restriction."
          />
          <button
            type="button"
            onClick={clear}
            className="min-h-[44px] rounded-md border border-input bg-background px-4 py-2 text-xs font-semibold shadow-xs hover:bg-accent transition-colors cursor-pointer"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          {query.isFetching && !query.isPending && (
            <div role="status" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span>Refreshing orders data…</span>
            </div>
          )}

          <div
            ref={scrollContainerRef}
            className={`orders-scroll orders-scroll-container rounded-lg border overflow-auto max-h-[65vh] bg-card relative ${
              compact ? 'compact' : ''
            } ${query.isFetching && !query.isPending ? 'opacity-70 transition-opacity' : ''}`}
            role="region"
            aria-label="Order history"
            tabIndex={0}
            aria-busy={query.isFetching}
          >
            <Table className="w-full">
              <TableHeader className="bg-card sticky top-0 z-10 shadow-xs border-b">
                {table.getHeaderGroups().map(group => (
                  <TableRow key={group.id} className="hover:bg-transparent border-b">
                    {group.headers.map(header => (
                      <TableHead
                        key={header.id}
                        className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-2.5 px-3 bg-card"
                        aria-sort={
                          sortKeys.includes(header.id)
                            ? sort === header.id
                              ? direction === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                            : undefined
                        }
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody className="divide-y">
                {paddingTop > 0 && (
                  <TableRow aria-hidden="true" style={{ height: `${paddingTop}px` }}>
                    <TableCell
                      colSpan={table.getVisibleLeafColumns().length}
                      className="p-0 border-0"
                    />
                  </TableRow>
                )}
                {virtualRows.map(virtualRow => {
                  const row = table.getRowModel().rows[virtualRow.index];
                  if (!row) return null;
                  const isActive = row.original.id === params.get('order');
                  return (
                    <TableRow
                      key={row.original.id}
                      ref={node => rowVirtualizer.measureElement(node)}
                      data-index={virtualRow.index}
                      tabIndex={0}
                      data-order-id={row.original.id}
                      data-active={isActive ? 'true' : undefined}
                      aria-selected={isActive}
                      onClick={() => open(row.original.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          open(row.original.id);
                        }
                      }}
                      aria-label={`Open order ${row.original.platform_order_id}`}
                      className={`hover:bg-accent/50 focus-visible:bg-accent focus-visible:outline-none cursor-pointer transition-colors ${
                        isActive ? 'bg-primary/10 ring-2 ring-inset ring-primary' : ''
                      } ${compact ? 'py-1' : 'py-2.5'}`}
                    >
                      {row.getVisibleCells().map(cell => (
                        <TableCell
                          key={cell.id}
                          className={`${
                            ['discount', 'fees', 'amount'].includes(cell.column.id)
                              ? 'numeric text-right font-mono'
                              : ''
                          } px-3 py-2 text-xs`}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
                {paddingBottom > 0 && (
                  <TableRow aria-hidden="true" style={{ height: `${paddingBottom}px` }}>
                    <TableCell
                      colSpan={table.getVisibleLeafColumns().length}
                      className="p-0 border-0"
                    />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Footer */}
          <div className="orders-footer flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <p className="text-xs text-muted-foreground">
              Showing <span className="font-semibold text-foreground">{start}–{end}</span> of{' '}
              <span className="font-semibold text-foreground">{total}</span> · Total for all filtered orders:{' '}
              <span className="font-bold font-mono text-foreground">{money(query.data?.filtered_total_amount)}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page === 1 || query.isFetching}
                onClick={() => change({ page: String(page - 1) })}
                className="min-h-[44px] inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-2 text-xs font-semibold shadow-xs hover:bg-accent disabled:opacity-50 transition-colors"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Previous page</span>
              </button>
              <button
                type="button"
                disabled={end >= total || query.isFetching}
                onClick={() => change({ page: String(page + 1) })}
                className="min-h-[44px] inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-2 text-xs font-semibold shadow-xs hover:bg-accent disabled:opacity-50 transition-colors"
                aria-label="Next page"
              >
                <span>Next page</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </>
      )}

      <OrderModal rows={query.data?.rows ?? []} request={request} total={total} />
    </section>
  );
}
