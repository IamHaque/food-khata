import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from '../components/ui/sheet';
import { useBill } from '../hooks/api';
import { orders, type OrdersParams } from '../lib/api';
import type { components } from '../types/api';
import {
  formatOrderDate,
  getOrderVerificationStatus,
  OrderStatusChip,
  PlatformBadge,
} from './Orders';
import { ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Receipt } from 'lucide-react';
import '../styles/modal.css';

type Order = components['schemas']['Order'];

const money = (value: number | null | undefined) =>
  value == null
    ? 'Unknown'
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);

export function OrderModal({
  rows,
  request,
  total = 0,
}: {
  rows: Order[];
  request: OrdersParams;
  total?: number;
}) {
  const [params, setParams] = useSearchParams();
  const id = params.get('order') ?? undefined;
  const bill = useBill(id, request);
  const data = !bill.isPlaceholderData && !bill.isError && bill.data?.order.id === id ? bill.data : undefined;
  const last = useRef(id);
  const origin = useRef<HTMLElement | null>(null);
  const controller = useRef<AbortController | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [error, setError] = useState('');

  const scope = JSON.stringify(request);
  useEffect(() => {
    if (id) {
      last.current = id;
      if (!origin.current && document.activeElement instanceof HTMLElement) {
        origin.current = document.activeElement;
      }
    }
  }, [id]);

  useEffect(() => () => controller.current?.abort(), [scope]);

  const close = useCallback(() => {
    const next = new URLSearchParams(params);
    next.delete('order');
    setParams(next);
    const targetId = last.current;
    const row = targetId
      ? document.querySelector<HTMLElement>(`[data-order-id="${targetId}"]`)
      : null;
    const targetElement =
      row ??
      (origin.current?.isConnected
        ? origin.current
        : document.querySelector<HTMLElement>('[aria-label="Order history"]'));
    targetElement?.focus();
    origin.current = null;
  }, [params, setParams]);

  const currentIndex = rows.findIndex(row => row.id === id);
  const currentPage = Number(request.page ?? 1);
  const pageSize = Number(request.page_size ?? 50);

  const isFirst = currentPage <= 1 && currentIndex === 0;
  const isLast = total > 0 && currentIndex >= 0 && (currentPage - 1) * pageSize + currentIndex + 1 >= total;

  const adjacent = useCallback(
    async (delta: number) => {
      if (!id || navigating) return;
      if (delta < 0 && isFirst) return;
      if (delta > 0 && isLast) return;

      setNavigating(true);
      setError('');
      const abort = new AbortController();
      controller.current = abort;
      try {
        let index = rows.findIndex(row => row.id === id);
        let neighbor: Order | undefined;
        let targetPage = Number(request.page ?? 1);
        const size = Number(request.page_size ?? 50);
        if (index >= 0) {
          neighbor = rows[index + delta];
          if (!neighbor && targetPage + delta > 0) {
            const result = await orders({ ...request, page: targetPage + delta }, abort.signal);
            neighbor = delta > 0 ? result.rows[0] : result.rows.at(-1);
            targetPage += delta;
          }
        } else {
          for (let page = 1; ; page++) {
            const result = await orders({ ...request, page, page_size: 200 }, abort.signal);
            index = result.rows.findIndex(row => row.id === id);
            if (index >= 0) {
              const offset = index + delta;
              neighbor = result.rows[offset];
              const globalIndex = (page - 1) * 200 + offset;
              if (!neighbor && globalIndex >= 0 && globalIndex < result.total) {
                const other = await orders({ ...request, page: page + delta, page_size: 200 }, abort.signal);
                neighbor = delta > 0 ? other.rows[0] : other.rows.at(-1);
              }
              targetPage = Math.floor(globalIndex / size) + 1;
              break;
            }
            if (page * 200 >= result.total) break;
          }
        }
        if (neighbor && !abort.signal.aborted) {
          const next = new URLSearchParams(params);
          next.set('order', neighbor.id);
          next.set('page', String(targetPage));
          setParams(next);
        }
      } catch (reason) {
        if (!(reason instanceof Error && reason.name === 'AbortError'))
          setError('Could not load the adjacent order. Please retry.');
      } finally {
        setNavigating(false);
      }
    },
    [id, navigating, isFirst, isLast, rows, request, params, setParams]
  );

  useEffect(() => {
    if (!id) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input,textarea,select,pre,[contenteditable=true]'))
        return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        void adjacent(-1);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        void adjacent(1);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [id, adjacent, close]);

  const o = data?.order;
  const ladder: [string, number | null | undefined][] = [];
  if (o) {
    ladder.push(
      ['Subtotal', o.item_subtotal],
      ['Food discount', o.food_discount],
      ['Delivery fee', o.delivery_fee],
      ['Delivery discount', o.delivery_fee_discount],
      ['Packaging', o.packaging_fee],
      ['Platform fee', o.platform_fee],
      ['Taxes', o.total_tax],
      ['Tips', o.tip],
      ['Other charges', o.other_charges],
      ['Refunds', o.refund_amount]
    );
  }

  return (
    <Sheet
      open={!!id}
      onOpenChange={open => {
        if (!open) close();
      }}
    >
      <SheetContent
        side="right"
        className="order-sheet w-full sm:max-w-md lg:max-w-lg p-0 flex flex-col h-full bg-card shadow-2xl border-l overflow-hidden"
        onCloseAutoFocus={event => {
          event.preventDefault();
          const targetId = last.current;
          const row = targetId
            ? document.querySelector<HTMLElement>(`[data-order-id="${targetId}"]`)
            : null;
          const targetElement =
            row ??
            (origin.current?.isConnected
              ? origin.current
              : document.querySelector<HTMLElement>('[aria-label="Order history"]'));
          targetElement?.focus();
          origin.current = null;
        }}
        onKeyDown={event => {
          if (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,pre,[contenteditable=true]'))
            return;
          if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
            event.preventDefault();
            void adjacent(-1);
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
            event.preventDefault();
            void adjacent(1);
          }
        }}
      >
        {/* Sheet Header */}
        <SheetHeader className="order-sheet-header p-5 border-b bg-card space-y-2 text-left pr-12">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Order receipt</span>
            </div>
            {o && (
              <span className="font-mono text-xs text-muted-foreground font-semibold" data-testid="order-sheet-id">
                {`#${o.platform_order_id}`}
              </span>
            )}
          </div>
          <div>
            <SheetTitle className="text-lg font-bold text-foreground text-left" title={o?.restaurant_name ?? undefined}>
              {o?.restaurant_name ?? 'Order details'}
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground mt-1 text-left" asChild>
              <div>
                {o ? (
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <PlatformBadge platform={o.platform} />
                    <OrderStatusChip status={getOrderVerificationStatus(o)} />
                    <span className="text-muted-foreground font-medium">
                      {formatOrderDate(o.order_timestamp || o.order_date)}
                      {o.order_time ? ` · ${o.order_time}` : ''}
                    </span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground uppercase">
                      {o.order_status}
                    </span>
                  </div>
                ) : (
                  <span>Loading the selected order…</span>
                )}
              </div>
            </SheetDescription>
          </div>
        </SheetHeader>

        {/* Sheet Body */}
        <div
          className="order-sheet-body p-5 flex-1 overflow-y-auto space-y-5"
          aria-busy={bill.isFetching || navigating}
        >
          {bill.isError ? (
            <div role="alert" className="p-4 rounded-lg border border-destructive/20 bg-destructive/10 text-xs text-destructive">
              <p>Order details could not load.</p>
              <button
                type="button"
                onClick={() => void bill.refetch()}
                className="mt-2 min-h-[44px] rounded border px-3 py-1 bg-background shadow-xs hover:bg-accent font-medium text-foreground"
              >
                Retry
              </button>
            </div>
          ) : !data ? (
            <div className="bill-skeleton p-8 text-center text-xs text-muted-foreground animate-pulse" role="status">
              Loading receipt…
            </div>
          ) : (
            <>
              {/* Order Meta Attributes */}
              <dl className="order-context grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 rounded-lg border bg-muted/20 text-xs">
                <div>
                  <dt className="text-xs text-muted-foreground font-medium">Order ID</dt>
                  <dd className="font-mono font-semibold text-foreground truncate">{o?.platform_order_id}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground font-medium">Account</dt>
                  <dd className="font-semibold text-foreground truncate">
                    {o?.account_label}
                  </dd>
                </div>
                {o?.payment_method && (
                  <div>
                    <dt className="text-xs text-muted-foreground font-medium">Payment</dt>
                    <dd className="font-semibold text-foreground">{o.payment_method}</dd>
                  </div>
                )}
                {o?.address_label && (
                  <div>
                    <dt className="text-xs text-muted-foreground font-medium">Delivery</dt>
                    <dd className="font-semibold text-foreground">{o.address_label}</dd>
                  </div>
                )}
                {o?.city && (
                  <div>
                    <dt className="text-xs text-muted-foreground font-medium">City</dt>
                    <dd className="font-semibold text-foreground">{o.city}</dd>
                  </div>
                )}
                {o?.user_rating != null && (
                  <div>
                    <dt className="text-xs text-muted-foreground font-medium">Rating</dt>
                    <dd className="font-semibold text-foreground">★ {o.user_rating}</dd>
                  </div>
                )}
              </dl>

              {/* Items List */}
              <div className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What was ordered</h2>
                <div
                  className="bill-table-scroll rounded-lg border overflow-x-auto"
                  tabIndex={0}
                  role="region"
                  aria-label="Order items"
                >
                  <table className="w-full text-xs" aria-label="Order items table">
                    <thead className="bg-muted/40 border-b">
                      <tr>
                        <th className="text-left p-2.5 font-medium">Item</th>
                        <th className="text-center p-2.5 font-medium">Diet</th>
                        <th className="text-right p-2.5 font-medium">Qty</th>
                        <th className="text-right p-2.5 font-medium">Unit price</th>
                        <th className="text-right p-2.5 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y font-mono">
                      {data.items.map((item, index) => (
                        <tr key={index} className="hover:bg-muted/30">
                          <td className="p-2.5 font-sans font-medium">
                            <span className="block truncate max-w-[200px]" title={item.item_name}>
                              {item.item_name}
                            </span>
                            {item.category && <small className="text-muted-foreground block text-xs font-normal">{item.category}</small>}
                          </td>
                          <td className="p-2.5 text-center font-sans text-sm">
                            {item.is_veg == null ? (
                              <span className="text-muted-foreground">? Unknown</span>
                            ) : item.is_veg ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">● Veg</span>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400 font-bold">◆ Non-veg</span>
                            )}
                          </td>
                          <td className="p-2.5 text-right">{item.quantity}</td>
                          <td className="p-2.5 text-right">{money(item.unit_price)}</td>
                          <td className="p-2.5 text-right font-semibold">{money(item.total_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payment Breakdown Ladder */}
              <div className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment breakdown</h2>
                <dl className="bill-ladder rounded-lg border p-3 bg-muted/20 text-xs space-y-1.5 font-mono">
                  {ladder
                    .filter(([, value]) => value != null)
                    .map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between py-1 border-b border-border/40 font-sans last:border-0">
                        <dt className="text-muted-foreground text-xs">{label}</dt>
                        <dd className="font-mono font-medium">{money(value)}</dd>
                      </div>
                    ))}
                  <div className="bill-final flex items-center justify-between pt-2 border-t font-sans text-sm font-bold text-foreground">
                    <dt>Net paid</dt>
                    <dd className="text-base font-mono text-primary font-bold">{money(o?.final_amount_paid)}</dd>
                  </div>
                </dl>
              </div>

              {/* Itemized discounts */}
              {(data.discount_items.length > 0 || (o?.total_discount != null && o.total_discount > 0)) && (
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Itemized discounts</h3>
                  <dl className="bill-ladder rounded-lg border p-3 bg-muted/20 text-xs space-y-1 font-mono">
                    {data.discount_items.length > 0 ? (
                      data.discount_items.map((discount, index) => (
                        <div key={index} className="flex items-center justify-between py-1 border-b border-border/40 font-sans last:border-0">
                          <dt className="text-muted-foreground text-xs">{discount.label}</dt>
                          <dd className="font-mono font-medium text-emerald-600 dark:text-emerald-400">{`-${money(discount.amount)}`}</dd>
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center justify-between py-1 font-sans">
                        <dt className="text-muted-foreground text-xs">Total discount</dt>
                        <dd className="font-mono font-medium text-emerald-600 dark:text-emerald-400">{`-${money(o?.total_discount)}`}</dd>
                      </div>
                    )}
                  </dl>
                </section>
              )}

              {/* Verification & Reconciliation Banner */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span
                  className="balance-badge inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                  title="Known components balance within INR 1. This does not verify bank transactions."
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {data.reconciliation_label}
                </span>
                {data.reconciliation_status === 'off' && (
                  <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
                    <AlertCircle className="h-3.5 w-3.5" /> Provider total retained; known bill components do not fully reconcile.
                  </span>
                )}
                {!o?.source_complete && (
                  <span className="text-xs text-muted-foreground">Some source bill details are incomplete.</span>
                )}
              </div>

              {/* Raw bill data disclosure */}
              {data.source_bill != null && (
                <details className="text-xs group border-t pt-2">
                  <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground select-none">
                    Raw bill data
                  </summary>
                  <pre tabIndex={0} className="mt-2 p-3 rounded-lg border bg-muted/40 font-mono text-sm overflow-auto max-h-48 text-muted-foreground">
                    {JSON.stringify(data.source_bill, null, 2)}
                  </pre>
                </details>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {error}
            </p>
          )}
        </div>

        {/* Sheet Footer with Actions */}
        <footer className="order-sheet-footer flex items-center justify-between p-4 border-t bg-card mt-auto">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isFirst || navigating || bill.isPending}
              aria-disabled={isFirst || navigating || bill.isPending}
              onClick={() => {
                if (isFirst || navigating || bill.isPending) return;
                void adjacent(-1);
              }}
              className="min-h-[44px] inline-flex items-center gap-1 rounded-md border border-input bg-background px-3.5 py-2 text-xs font-semibold shadow-xs hover:bg-accent disabled:opacity-50 disabled:pointer-events-none transition-colors"
              aria-label="Previous order"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Previous order</span>
            </button>
            <button
              type="button"
              disabled={isLast || navigating || bill.isPending}
              aria-disabled={isLast || navigating || bill.isPending}
              onClick={() => {
                if (isLast || navigating || bill.isPending) return;
                void adjacent(1);
              }}
              className="min-h-[44px] inline-flex items-center gap-1 rounded-md border border-input bg-background px-3.5 py-2 text-xs font-semibold shadow-xs hover:bg-accent disabled:opacity-50 disabled:pointer-events-none transition-colors"
              aria-label="Next order"
            >
              <span>Next order</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <SheetClose asChild>
            <button
              type="button"
              onClick={close}
              className="min-h-[44px] rounded-md border border-input bg-background px-4 py-2 text-xs font-semibold shadow-xs hover:bg-accent transition-colors"
            >
              Close receipt
            </button>
          </SheetClose>
        </footer>
      </SheetContent>
    </Sheet>
  );
}

export const OrderSheet = OrderModal;
