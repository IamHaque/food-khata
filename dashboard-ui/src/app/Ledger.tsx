import { OrderModal } from './OrderModal';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useReactTable, getCoreRowModel, flexRender, type ColumnDef, type VisibilityState } from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { useOrders } from '../hooks/api';
import { useFilters } from './FilterContext';
import { exportLedger } from '../lib/ledger';
import type { components } from '../types/api';
import { Download, SlidersHorizontal, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle } from 'lucide-react';

type Order = components['schemas']['Order'];

const money = (n: number | null | undefined) =>
  n == null
    ? 'Unknown'
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);

const sortKeys = ['date', 'restaurant', 'platform', 'status', 'discount', 'fees', 'amount'];

export function Ledger() {
  const { filters, update, clear } = useFilters();
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    if (!params.has('statuses')) update({ statuses: [] });
  }, [params, update]);

  const rawPage = Number(params.get('page') ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const requestedSize = Number(params.get('page_size') ?? 50);
  const pageSize = [25, 50, 100, 200].includes(requestedSize) ? requestedSize : 50;
  const requestedSort = params.get('sort') ?? 'date';
  const sort = sortKeys.includes(requestedSort) ? requestedSort : 'date';
  const direction = params.get('direction') === 'asc' ? 'asc' : 'desc';

  const request = {
    ...filters,
    statuses: params.has('statuses') ? filters.statuses : [],
    page,
    page_size: pageSize,
    sort,
    direction,
  };

  const query = useOrders(request);
  const [visibility, setVisibility] = useState<VisibilityState>({});
  const [compact, setCompact] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const abort = useRef<AbortController | null>(null);

  const scope = JSON.stringify(filters);
  useEffect(() => () => abort.current?.abort(), [scope]);

  const change = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    setParams(next);
  };

  const open = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('order', id);
    setParams(next);
  };

  const sortable = (id: string, label: string) => (
    <button
      onClick={() => change({ sort: id, direction: sort === id && direction === 'desc' ? 'asc' : 'desc', page: '1' })}
      className="inline-flex items-center gap-1 font-semibold text-xs text-foreground hover:text-primary transition-colors cursor-pointer select-none"
    >
      <span>{label}</span>
      <span className="text-[11px] text-muted-foreground">{sort === id ? (direction === 'asc' ? ' ↑' : ' ↓') : ''}</span>
    </button>
  );

  const columns: ColumnDef<Order>[] = [
    {
      id: 'date',
      header: () => sortable('date', 'Date'),
      accessorKey: 'order_timestamp',
      cell: info => (
        <span className="font-mono text-xs whitespace-nowrap text-muted-foreground">
          {String(info.getValue()).slice(0, 10)}
        </span>
      ),
    },
    ...(filters.account_ids.length ? [] : [{ id: 'account', header: 'Account', accessorKey: 'account_label' }]),
    {
      id: 'restaurant',
      header: () => sortable('restaurant', 'Restaurant'),
      accessorKey: 'restaurant_name',
      cell: info => (
        <span className="truncate-cell font-medium text-xs max-w-[200px] truncate block" title={info.row.original.restaurant_name ?? 'Unknown'}>
          {info.row.original.restaurant_name ?? 'Unknown'}
        </span>
      ),
    },
    {
      id: 'items',
      header: 'Items',
      accessorKey: 'items_summary',
      cell: info => (
        <span className="truncate-cell text-xs text-muted-foreground max-w-[220px] truncate block" title={info.row.original.items_summary ?? 'Unknown'}>
          {info.row.original.items_summary ?? 'Unknown'}
        </span>
      ),
    },
    {
      id: 'platform',
      header: () => sortable('platform', 'Platform'),
      accessorKey: 'platform',
      cell: info => {
        const plat = info.row.original.platform;
        return (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase border ${
              plat === 'SWIGGY'
                ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
            }`}
          >
            {plat}
          </span>
        );
      },
    },
    {
      id: 'status',
      header: () => sortable('status', 'Status'),
      accessorKey: 'order_status',
      cell: info => {
        const st = info.row.original.order_status;
        const isDelivered = st === 'DELIVERED';
        return (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase border ${
              isDelivered
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${isDelivered ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            {st}
          </span>
        );
      },
    },
    {
      id: 'discount',
      header: () => sortable('discount', 'Discount'),
      cell: info => <span className="font-mono text-xs text-muted-foreground">{money(info.row.original.total_discount)}</span>,
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
      id: 'amount',
      header: () => sortable('amount', 'Amount'),
      cell: info => <span className="font-mono text-xs font-semibold text-foreground">{money(info.row.original.final_amount_paid)}</span>,
    },
    {
      id: 'verified',
      header: 'Bill balance',
      cell: info =>
        info.row.original.financial_verified ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> Matches
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" /> Review
          </span>
        ),
    },
  ];

  const table = useReactTable({
    data: query.data?.rows ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    rowCount: query.data?.total ?? 0,
    state: { columnVisibility: visibility, pagination: { pageIndex: page - 1, pageSize } },
    onColumnVisibilityChange: setVisibility,
  });

  async function download() {
    const controller = new AbortController();
    abort.current = controller;
    setExporting(true);
    setExportMessage('');
    try {
      const csv = await exportLedger(request, controller.signal);
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'food-khata-orders.csv';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportMessage('CSV exported');
    } catch (error) {
      setExportMessage(error instanceof Error && error.name === 'AbortError' ? 'Export cancelled' : 'Could not export. Please retry.');
    } finally {
      setExporting(false);
    }
  }

  const total = query.data?.total ?? 0;
  const start = total ? Math.min((page - 1) * pageSize + 1, total) : 0;
  const end = Math.min(page * pageSize, total);

  return (
    <section className="page-panel rounded-xl border bg-card p-4 sm:p-6 shadow-xs space-y-4">
      {/* Title */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Ledger</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Full order history. “Matches” means known components balance within INR 1.
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="ledger-tools flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            aria-pressed={filters.anomaly === 'review'}
            onClick={() => update({ anomaly: filters.anomaly === 'review' ? 'all' : 'review' })}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold shadow-xs transition-colors border ${
              filters.anomaly === 'review'
                ? 'bg-amber-500 text-white border-amber-600'
                : 'border-input bg-background hover:bg-accent text-foreground'
            }`}
          >
            Review unverified or unbalanced bills
          </button>

          <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <span className="text-muted-foreground">Rows per page</span>
            <select
              aria-label="Rows per page"
              value={pageSize}
              onChange={e => change({ page_size: e.target.value, page: '1' })}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-xs focus:ring-1 focus:ring-ring text-foreground"
            >
              {[25, 50, 100, 200].map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <span className="text-muted-foreground">Density</span>
            <select
              aria-label="Density"
              value={compact ? 'compact' : 'comfortable'}
              onChange={e => setCompact(e.target.value === 'compact')}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-xs focus:ring-1 focus:ring-ring text-foreground"
            >
              <option value="comfortable">comfortable</option>
              <option value="compact">compact</option>
            </select>
          </label>

          <details className="relative">
            <summary className="cursor-pointer rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium shadow-xs hover:bg-accent text-foreground list-none flex items-center gap-1">
              <SlidersHorizontal className="h-3 w-3 text-muted-foreground" />
              <span>Columns</span>
            </summary>
            <div className="absolute left-0 top-8 z-30 w-44 rounded-md border bg-popover p-2 shadow-lg space-y-1">
              {table.getAllLeafColumns().map(column => (
                <label className="check flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer hover:bg-accent px-1.5 py-1 rounded" key={column.id}>
                  <input
                    type="checkbox"
                    checked={column.getIsVisible()}
                    onChange={column.getToggleVisibilityHandler()}
                    className="h-3.5 w-3.5 rounded border-input"
                  />
                  <span className="capitalize">{column.id}</span>
                </label>
              ))}
            </div>
          </details>
        </div>

        <div className="flex items-center gap-2">
          <button
            disabled={exporting || query.isPending || query.isError}
            onClick={() => void download()}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-semibold shadow-xs hover:bg-accent disabled:opacity-50 text-foreground transition-colors cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Export CSV</span>
          </button>
          {exporting && (
            <button
              onClick={() => abort.current?.abort()}
              className="rounded-md border border-destructive/30 bg-destructive/10 text-destructive px-2.5 py-1.5 text-xs font-medium hover:bg-destructive/20 transition-colors"
            >
              Cancel export
            </button>
          )}
        </div>
      </div>

      {exportMessage && (
        <p role="status" className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
          {exportMessage}
        </p>
      )}

      {query.isError ? (
        <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive flex items-center justify-between">
          <span>Orders could not load.</span>
          <button onClick={() => void query.refetch()} className="rounded border px-2.5 py-1 bg-background shadow-xs hover:bg-accent font-medium">
            Retry
          </button>
        </div>
      ) : query.isPending ? (
        <div aria-busy="true" className="ledger-skeleton rounded-lg border bg-muted/20 p-8 text-center text-xs text-muted-foreground animate-pulse">
          Loading order history…
        </div>
      ) : total === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center space-y-2">
          <p className="font-semibold text-foreground text-sm">No orders match these filters</p>
          <p className="text-xs text-muted-foreground">Try clearing the restaurant, search or date restriction.</p>
          <button onClick={clear} className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-xs hover:bg-accent">
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <div
            className={`ledger-scroll ${compact ? 'compact' : ''} rounded-lg border overflow-auto max-h-[65vh] bg-card`}
            role="region"
            aria-label="Order history"
            tabIndex={0}
            aria-busy={query.isFetching}
          >
            <Table>
              <TableHeader className="bg-muted/50 sticky top-0 z-10">
                {table.getHeaderGroups().map(group => (
                  <TableRow key={group.id} className="hover:bg-transparent border-b">
                    {group.headers.map(header => (
                      <TableHead
                        key={header.id}
                        className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-2.5 px-3"
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
                {table.getRowModel().rows.map(row => (
                  <TableRow
                    key={row.original.id}
                    tabIndex={0}
                    data-order-id={row.original.id}
                    onClick={() => open(row.original.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        open(row.original.id);
                      }
                    }}
                    aria-label={`Open order ${row.original.platform_order_id}`}
                    className={`hover:bg-accent/50 focus-visible:bg-accent focus-visible:outline-none cursor-pointer transition-colors ${
                      compact ? 'py-1' : 'py-2.5'
                    }`}
                  >
                    {row.getVisibleCells().map(cell => (
                      <TableCell
                        key={cell.id}
                        className={`${
                          ['discount', 'fees', 'amount'].includes(cell.column.id) ? 'numeric text-right font-mono' : ''
                        } px-3 py-2 text-xs`}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Footer */}
          <div className="ledger-footer flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <p className="text-xs text-muted-foreground">
              Showing <span className="font-semibold text-foreground">{start}–{end}</span> of{' '}
              <span className="font-semibold text-foreground">{total}</span> · Total for all filtered orders:{' '}
              <span className="font-bold font-mono text-foreground">{money(query.data?.filtered_total_amount)}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 1 || query.isFetching}
                onClick={() => change({ page: String(page - 1) })}
                className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-semibold shadow-xs hover:bg-accent disabled:opacity-50 transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Previous page</span>
              </button>
              <button
                disabled={end >= total || query.isFetching}
                onClick={() => change({ page: String(page + 1) })}
                className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-semibold shadow-xs hover:bg-accent disabled:opacity-50 transition-colors"
              >
                <span>Next page</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </>
      )}

      <OrderModal rows={query.data?.rows ?? []} request={request} />
    </section>
  );
}
