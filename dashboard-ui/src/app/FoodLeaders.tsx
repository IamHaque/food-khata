import { useState } from 'react';
import { useRestaurants, useItems } from '../hooks/api';
import { useFilters } from './FilterContext';
import { Chart } from './Chart';

export function FoodLeaders() {
  const { filters } = useFilters();
  const [minimum, setMinimum] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [grouping, setGrouping] = useState<'merged' | 'listing'>('merged');
  const [page, setPage] = useState(1);
  const [dish, setDish] = useState('');
  const restaurants = useRestaurants({ ...filters, min_orders: minimum, grouping, page, page_size: 25 });
  const items = useItems({ ...filters, min_qty: quantity, page, page_size: 25 });
  const selected = items.data?.rows.find(x => x.key === dish);

  return (
    <>
      <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-4">
        <div className="border-b pb-3">
          <h2 className="text-base font-semibold text-foreground">Restaurant and dish leaders</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Top vendors and items with custom minimum thresholds</p>
        </div>

        {/* Filter inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
            <span className="text-[11px] text-muted-foreground">Minimum restaurant orders</span>
            <input
              type="number"
              min="1"
              value={minimum}
              onChange={e => {
                setMinimum(Math.max(1, Number(e.target.value) || 1));
                setPage(1);
              }}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-mono shadow-xs focus:ring-1 focus:ring-ring"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
            <span className="text-[11px] text-muted-foreground">Restaurant grouping</span>
            <select
              value={grouping}
              onChange={e => {
                setGrouping(e.target.value as 'merged' | 'listing');
                setPage(1);
              }}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-xs focus:ring-1 focus:ring-ring"
            >
              <option value="merged">Name and locality</option>
              <option value="listing">Platform listing</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
            <span className="text-[11px] text-muted-foreground">Minimum dish quantity</span>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={e => {
                setQuantity(Math.max(1, Number(e.target.value) || 1));
                setPage(1);
              }}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-mono shadow-xs focus:ring-1 focus:ring-ring"
            />
          </label>
        </div>

        {/* Tables */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {([['Restaurants', restaurants], ['Dishes', items]] as const).map(([title, query]) => (
            <section key={title} aria-busy={query.isFetching} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
              {query.isError ? (
                <button
                  onClick={() => void query.refetch()}
                  className="rounded border border-input px-3 py-1 text-xs shadow-xs hover:bg-accent"
                >
                  Retry {title}
                </button>
              ) : query.isPending ? (
                <p role="status" className="text-xs text-muted-foreground animate-pulse p-4">
                  Loading…
                </p>
              ) : (
                <div className="overview-scroll rounded-lg border overflow-x-auto" tabIndex={0}>
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 border-b">
                      <tr>
                        <th className="text-left p-2.5 font-medium">Name</th>
                        <th className="text-right p-2.5 font-medium">Qty / orders</th>
                        <th className="text-right p-2.5 font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y font-mono">
                      {query.data.rows.map(x => (
                        <tr key={x.key} className="hover:bg-muted/30">
                          <td className="p-2.5 font-sans">
                            {title === 'Dishes' ? (
                              <button
                                onClick={() => setDish(x.key)}
                                className="text-primary font-medium hover:underline text-left truncate block max-w-[180px]"
                              >
                                {x.name}
                              </button>
                            ) : (
                              <span className="font-medium text-foreground truncate block max-w-[180px]">{x.name}</span>
                            )}
                          </td>
                          <td className="p-2.5 text-right text-muted-foreground">{x.quantity}</td>
                          <td className="p-2.5 text-right font-semibold text-foreground">{x.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!query.data.rows.length && (
                    <p className="p-4 text-center text-xs text-muted-foreground">No matching groups.</p>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t pt-3">
          <button
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className="rounded-md border border-input bg-background px-3 py-1 text-xs font-semibold shadow-xs hover:bg-accent disabled:opacity-50"
          >
            Previous leaders
          </button>
          <span className="text-xs text-muted-foreground font-mono">Page {page}</span>
          <button
            disabled={page * 25 >= Math.max(restaurants.data?.total ?? 0, items.data?.total ?? 0)}
            onClick={() => setPage(page + 1)}
            className="rounded-md border border-input bg-background px-3 py-1 text-xs font-semibold shadow-xs hover:bg-accent disabled:opacity-50"
          >
            Next leaders
          </button>
        </div>
      </div>

      {selected && (
        <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
          <h2 className="text-base font-semibold text-foreground">Unit price history: {selected.name}</h2>
          <Chart
            summary="Quantity-weighted unit price by month"
            headers={['Month', 'Unit price', 'Quantity']}
            rows={selected.price_trend.map(x => [x.month, x.unit_price, x.quantity])}
            option={{
              tooltip: { trigger: 'axis', renderMode: 'richText' },
              grid: { left: 60, right: 25, bottom: 50, top: 20 },
              xAxis: { type: 'category', data: selected.price_trend.map(x => x.month ?? 'Unknown') },
              yAxis: { type: 'value' },
              series: [
                {
                  type: 'line',
                  smooth: true,
                  itemStyle: { color: 'hsl(var(--primary))' },
                  data: selected.price_trend.map(x => x.unit_price),
                },
              ],
            }}
          />
        </div>
      )}
    </>
  );
}
