import { useState } from 'react';
import { useRestaurants, useItems } from '../hooks/api';
import { useFilters } from './FilterContext';
import { Chart } from './Chart';

interface SelectedDish {
  key: string;
  name: string;
  price_trend: Array<{
    month: string | null;
    unit_price: number | null;
    quantity: number;
  }>;
}

export function FoodLeaders() {
  const { filters } = useFilters();
  const [minimum, setMinimum] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [grouping, setGrouping] = useState<'merged' | 'listing'>('merged');
  const [restaurantPage, setRestaurantPage] = useState(1);
  const [dishPage, setDishPage] = useState(1);
  const [selectedDish, setSelectedDish] = useState<SelectedDish | null>(null);

  const restaurants = useRestaurants({
    ...filters,
    min_orders: minimum,
    grouping,
    page: restaurantPage,
    page_size: 25,
  });

  const items = useItems({
    ...filters,
    min_qty: quantity,
    page: dishPage,
    page_size: 25,
  });

  const totalRestaurantPages = Math.max(1, Math.ceil((restaurants.data?.total ?? 0) / 25));
  const totalDishPages = Math.max(1, Math.ceil((items.data?.total ?? 0) / 25));

  // Check if selected dish is present on the currently viewed page
  const dishInCurrentPage = items.data?.rows.find(x => x.key === selectedDish?.key);
  const currentSelection = dishInCurrentPage ?? selectedDish;

  const handleSelectDish = (row: {
    key: string;
    name: string;
    price_trend: Array<{ month: string | null; unit_price: number | null; quantity: number }>;
  }) => {
    setSelectedDish({
      key: row.key,
      name: row.name,
      price_trend: row.price_trend,
    });
  };

  return (
    <>
      <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-4">
        <div className="border-b pb-3">
          <h2 className="text-base font-semibold text-foreground">Restaurant and dish leaders</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Top vendors and items with independent pagination and custom minimum thresholds
          </p>
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
                setRestaurantPage(1);
              }}
              className="h-10 rounded-md border border-input bg-background px-2.5 text-xs font-mono shadow-xs focus:ring-1 focus:ring-ring"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
            <span className="text-[11px] text-muted-foreground">Restaurant grouping</span>
            <select
              value={grouping}
              onChange={e => {
                setGrouping(e.target.value as 'merged' | 'listing');
                setRestaurantPage(1);
              }}
              className="h-10 rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-xs focus:ring-1 focus:ring-ring"
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
                setDishPage(1);
              }}
              className="h-10 rounded-md border border-input bg-background px-2.5 text-xs font-mono shadow-xs focus:ring-1 focus:ring-ring"
            />
          </label>
        </div>

        {/* Tables */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {/* Restaurants Table */}
          <section aria-busy={restaurants.isFetching} className="space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Restaurants</h3>
                {restaurants.data?.total != null && (
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {restaurants.data.total} {restaurants.data.total === 1 ? 'vendor' : 'vendors'}
                  </span>
                )}
              </div>
              {restaurants.isError ? (
                <button
                  type="button"
                  onClick={() => void restaurants.refetch()}
                  className="min-h-[44px] rounded border border-input px-3 py-1 text-xs shadow-xs hover:bg-accent"
                >
                  Retry restaurants
                </button>
              ) : restaurants.isPending ? (
                <p role="status" className="text-xs text-muted-foreground animate-pulse p-4">
                  Loading restaurants…
                </p>
              ) : (
                <div className="overview-scroll rounded-lg border overflow-x-auto" tabIndex={0}>
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 border-b">
                      <tr>
                        <th className="text-left p-2.5 font-medium">Name</th>
                        <th className="text-right p-2.5 font-medium">Orders</th>
                        <th className="text-right p-2.5 font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y font-mono">
                      {restaurants.data.rows.map(x => (
                        <tr key={x.key} className="hover:bg-muted/30">
                          <td className="p-2.5 font-sans">
                            <span className="font-medium text-foreground truncate block max-w-[180px]">{x.name}</span>
                          </td>
                          <td className="p-2.5 text-right text-muted-foreground">{x.quantity.toLocaleString('en-IN')}</td>
                          <td className="p-2.5 text-right font-semibold text-foreground">
                            ₹{Number(x.amount).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!restaurants.data.rows.length && (
                    <p className="p-4 text-center text-xs text-muted-foreground">No matching restaurants.</p>
                  )}
                </div>
              )}
            </div>

            {/* Independent Restaurant Pagination */}
            <div className="flex items-center justify-between border-t pt-3">
              <button
                type="button"
                disabled={restaurantPage <= 1}
                onClick={() => setRestaurantPage(p => Math.max(1, p - 1))}
                className="min-h-[44px] px-3 py-2 rounded-md border border-input bg-background text-xs font-semibold shadow-xs hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
                aria-label="Previous restaurants page"
              >
                Previous restaurants
              </button>
              <span className="text-xs text-muted-foreground font-mono">
                Page {restaurantPage} of {totalRestaurantPages}
              </span>
              <button
                type="button"
                disabled={restaurantPage >= totalRestaurantPages}
                onClick={() => setRestaurantPage(p => p + 1)}
                className="min-h-[44px] px-3 py-2 rounded-md border border-input bg-background text-xs font-semibold shadow-xs hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
                aria-label="Next restaurants page"
              >
                Next restaurants
              </button>
            </div>
          </section>

          {/* Dishes Table */}
          <section aria-busy={items.isFetching} className="space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dishes</h3>
                {items.data?.total != null && (
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {items.data.total} {items.data.total === 1 ? 'item' : 'items'}
                  </span>
                )}
              </div>
              {items.isError ? (
                <button
                  type="button"
                  onClick={() => void items.refetch()}
                  className="min-h-[44px] rounded border border-input px-3 py-1 text-xs shadow-xs hover:bg-accent"
                >
                  Retry dishes
                </button>
              ) : items.isPending ? (
                <p role="status" className="text-xs text-muted-foreground animate-pulse p-4">
                  Loading dishes…
                </p>
              ) : (
                <div className="overview-scroll rounded-lg border overflow-x-auto" tabIndex={0}>
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 border-b">
                      <tr>
                        <th className="text-left p-2.5 font-medium">Name</th>
                        <th className="text-right p-2.5 font-medium">Qty</th>
                        <th className="text-right p-2.5 font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y font-mono">
                      {items.data.rows.map(x => (
                        <tr
                          key={x.key}
                          className={`hover:bg-muted/30 ${currentSelection?.key === x.key ? 'bg-muted/40' : ''}`}
                        >
                          <td className="p-2.5 font-sans">
                            <button
                              type="button"
                              onClick={() => handleSelectDish(x)}
                              className="text-primary font-medium hover:underline text-left truncate block max-w-[180px] p-1 -m-1"
                            >
                              {x.name}
                            </button>
                          </td>
                          <td className="p-2.5 text-right text-muted-foreground">{x.quantity.toLocaleString('en-IN')}</td>
                          <td className="p-2.5 text-right font-semibold text-foreground">
                            ₹{Number(x.amount).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!items.data.rows.length && (
                    <p className="p-4 text-center text-xs text-muted-foreground">No matching dishes.</p>
                  )}
                </div>
              )}
            </div>

            {/* Independent Dish Pagination */}
            <div className="flex items-center justify-between border-t pt-3">
              <button
                type="button"
                disabled={dishPage <= 1}
                onClick={() => setDishPage(p => Math.max(1, p - 1))}
                className="min-h-[44px] px-3 py-2 rounded-md border border-input bg-background text-xs font-semibold shadow-xs hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
                aria-label="Previous dishes page"
              >
                Previous dishes
              </button>
              <span className="text-xs text-muted-foreground font-mono">
                Page {dishPage} of {totalDishPages}
              </span>
              <button
                type="button"
                disabled={dishPage >= totalDishPages}
                onClick={() => setDishPage(p => p + 1)}
                className="min-h-[44px] px-3 py-2 rounded-md border border-input bg-background text-xs font-semibold shadow-xs hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
                aria-label="Next dishes page"
              >
                Next dishes
              </button>
            </div>
          </section>
        </div>
      </div>

      {currentSelection && (
        <div className="page-panel rounded-xl border bg-card p-5 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">
                  Unit price history: {currentSelection.name}
                </h2>
                {!dishInCurrentPage && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">
                    Retained from prior view
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Quantity-weighted unit price by month. Gaps indicate months with no recorded orders for this item.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDish(null)}
              className="min-h-[44px] px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
              aria-label="Clear selected dish history"
            >
              Clear selection
            </button>
          </div>

          <Chart
            summary={`Quantity-weighted unit price by month for ${currentSelection.name}`}
            headers={['Month', 'Unit price (₹)', 'Quantity']}
            rows={currentSelection.price_trend.map(x => [
              x.month ?? 'Unknown',
              x.unit_price != null ? `₹${x.unit_price.toFixed(2)}` : 'Unknown',
              x.quantity,
            ])}
            option={{
              tooltip: {
                trigger: 'axis',
                renderMode: 'richText',
                valueFormatter: (val: unknown) =>
                  val != null ? `₹${Number(val).toLocaleString('en-IN')}` : 'Unknown',
              },
              grid: { left: 75, right: 25, bottom: 50, top: 25 },
              xAxis: {
                type: 'category',
                data: currentSelection.price_trend.map(x => x.month ?? 'Unknown'),
                axisLabel: { hideOverlap: true, fontSize: 11 },
              },
              yAxis: {
                type: 'value',
                name: 'Unit price (₹)',
                axisLabel: {
                  formatter: (v: number) => `₹${v.toLocaleString('en-IN')}`,
                },
              },
              series: [
                {
                  name: 'Unit price',
                  type: 'line',
                  smooth: false,
                  connectNulls: false,
                  data: currentSelection.price_trend.map(x => x.unit_price),
                },
              ],
            }}
          />
        </div>
      )}
    </>
  );
}
