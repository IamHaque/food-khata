import { useState, useMemo } from 'react';
import { useRestaurants, useItems } from '../hooks/api';
import { useFilters } from './FilterContext';
import { Chart } from './Chart';
import { SegmentedControl } from '../components/ui/segmented-control';
import { Search, X, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { inr, plural } from '../lib/format';
import { compactInr } from '../lib/chart-kit';
import { PageError } from '../components/dashboard';

export interface LeaderRow {
  key: string;
  name: string;
  quantity: number;
  amount: number;
  price_trend?: Array<{
    month: string | null;
    unit_price: number | null;
    quantity: number;
  }>;
}

export interface SelectedDish {
  key: string;
  name: string;
  price_trend: Array<{
    month: string | null;
    unit_price: number | null;
    quantity: number;
  }>;
}

export type SortKey = 'name' | 'quantity' | 'amount';
export type SortDirection = 'asc' | 'desc';

export interface SortState {
  key: SortKey;
  direction: SortDirection;
}

/** Merged restaurant keys look like "name|locality". */
export function localityOf(key: string): string | null {
  const part = key.split('|')[1];
  return part ? part.replace(/\b\w/g, c => c.toUpperCase()) : null;
}

/** Names that appear more than once need their locality to be told apart. */
export function duplicateNames(rows: { name: string }[]): Set<string> {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const r of rows) (seen.has(r.name) ? dup : seen).add(r.name);
  return dup;
}

/**
 * Pure filter helper for leader items by text query.
 */
export function filterLeaderRows<T extends { name: string; key?: string }>(
  rows: T[],
  search: string,
): T[] {
  if (!search || !search.trim()) return rows;
  const q = search.trim().toLowerCase();
  return rows.filter(
    r => r.name.toLowerCase().includes(q) || (r.key && r.key.toLowerCase().includes(q)),
  );
}

/**
 * Pure sort helper for leader items.
 */
export function sortLeaderRows<T extends { name: string; quantity: number; amount: number }>(
  rows: T[],
  sortKey: SortKey,
  direction: SortDirection,
): T[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'name') {
      cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    } else if (sortKey === 'quantity') {
      cmp = a.quantity - b.quantity;
    } else if (sortKey === 'amount') {
      cmp = a.amount - b.amount;
    }
    return direction === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

/**
 * Inline proportional progress bar cell for values relative to current view max.
 */
export function ProportionalBarCell({
  value,
  formatter = (v: number) => inr(v),
  testIdPrefix = 'amount',
}: {
  value: number;
  maxValue?: number;
  formatter?: (v: number) => string;
  label?: string;
  testIdPrefix?: string;
}) {
  // Ledger figure: right-aligned, tabular, never truncated.
  return (
    <span className="block whitespace-nowrap text-right text-sm font-medium tabular-nums text-foreground" data-testid={`${testIdPrefix}-cell`}>
      {formatter(value)}
    </span>
  );
}

/**
 * Sortable table header cell with visible direction indicators and aria-sort.
 */
export function SortableColumnHeader({
  label,
  sortKey,
  currentSortKey,
  currentDirection,
  onSort,
  align = 'left',
}: {
  label: string;
  sortKey: SortKey;
  currentSortKey: SortKey;
  currentDirection: SortDirection;
  onSort: (key: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const isSorted = currentSortKey === sortKey;
  const ariaSort = isSorted ? (currentDirection === 'asc' ? 'ascending' : 'descending') : 'none';

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`px-3 py-2 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1.5 hover:text-foreground transition-colors text-sm font-medium rounded px-1 -mx-1 min-h-[36px] ${
          align === 'right' ? 'flex-row-reverse' : ''
        } ${isSorted ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}
        aria-label={`Sort by ${label} ${isSorted ? (currentDirection === 'asc' ? 'descending' : 'ascending') : 'ascending'}`}
      >
        <span>{label}</span>
        {isSorted ? (
          currentDirection === 'asc' ? (
            <ArrowUp className="h-3.5 w-3.5 text-foreground shrink-0" aria-hidden="true" data-testid="sort-asc" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 text-foreground shrink-0" aria-hidden="true" data-testid="sort-desc" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-40 hover:opacity-100 shrink-0" aria-hidden="true" data-testid="sort-none" />
        )}
      </button>
    </th>
  );
}

/**
 * Search input box above leaders tables.
 */
export function LeadersSearchInput({
  value,
  onChange,
  onClear,
}: {
  value: string;
  onChange: (val: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="relative w-full sm:w-auto sm:min-w-[240px] sm:max-w-sm sm:flex-1">
      <label htmlFor="leaders-search-input" className="sr-only">
        Search restaurants and dishes
      </label>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        id="leaders-search-input"
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
        placeholder="Search restaurants and dishes…"
        aria-label="Search restaurants and dishes"
        data-testid="leaders-search-input"
        className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground"
      />
      {value ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          data-testid="clear-search-button"
          className="absolute right-0.5 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center text-muted-foreground hover:text-foreground rounded-full"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Restaurant row with keyboard accessibility and inline proportional bar.
 */
export function RestaurantRow({
  row,
  maxAmount,
  isSelected,
  onClick,
  onKeyDown,
  showLocality = false,
}: {
  row: LeaderRow;
  maxAmount: number;
  isSelected: boolean;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTableRowElement>) => void;
  showLocality?: boolean;
}) {
  const locality = showLocality ? localityOf(row.key) : null;
  return (
    <tr
      tabIndex={0}
      role="button"
      aria-pressed={isSelected}
      aria-label={`Filter dashboard by ${row.name}`}
      data-testid={`restaurant-row-${row.key}`}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`cursor-pointer transition-colors hover:bg-accent/50 ${
        isSelected ? 'bg-accent' : ''
      }`}
    >
      <td className="px-3 py-2.5">
        <span className="block break-words text-sm font-medium text-foreground">{row.name}</span>
        {locality && <span className="block text-xs text-muted-foreground">{locality}</span>}
      </td>
      <td className="px-3 py-2.5 text-right text-sm tabular-nums text-muted-foreground">{row.quantity.toLocaleString('en-IN')}</td>
      <td className="px-3 py-2.5 text-right">
        <ProportionalBarCell
          value={row.amount}
          maxValue={maxAmount}
          label="restaurant amount"
          testIdPrefix="restaurant-amount"
        />
      </td>
    </tr>
  );
}

/**
 * Dish row with keyboard accessibility, inline proportional bar, selection, and filter search action.
 */
export function DishRow({
  row,
  maxAmount,
  isSelected,
  onClick,
  onKeyDown,
  onFilterSearch,
}: {
  row: LeaderRow;
  maxAmount: number;
  isSelected: boolean;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTableRowElement>) => void;
  onFilterSearch: (name: string) => void;
}) {
  return (
    <tr
      tabIndex={0}
      role="button"
      aria-pressed={isSelected}
      aria-label={`Select dish ${row.name}`}
      data-testid={`dish-row-${row.key}`}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`cursor-pointer transition-colors hover:bg-accent/50 ${
        isSelected ? 'bg-accent' : ''
      }`}
    >
      <td className="px-3 py-2.5">
        <span className="block break-words text-sm font-medium text-foreground">{row.name}</span>
        {/* Explicit text instead of a bare magnifier icon: says what the button does. */}
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onFilterSearch(row.name);
          }}
          aria-label={`Filter dashboard by ${row.name}`}
          data-testid={`dish-filter-btn-${row.key}`}
          className="mt-0.5 inline-flex min-h-[28px] items-center gap-1 text-xs text-primary hover:underline"
        >
          <Search className="h-3 w-3" aria-hidden="true" />
          Find orders with this dish
        </button>
      </td>
      <td className="px-3 py-2.5 text-right text-sm tabular-nums text-muted-foreground">{row.quantity.toLocaleString('en-IN')}</td>
      <td className="px-3 py-2.5 text-right">
        <ProportionalBarCell
          value={row.amount}
          maxValue={maxAmount}
          label="dish amount"
          testIdPrefix="dish-amount"
        />
      </td>
    </tr>
  );
}

export interface FoodLeadersProps {
  onRestaurantClick?: (row: LeaderRow) => void;
  onDishClick?: (row: LeaderRow) => void;
}

export function FoodLeaders({ onRestaurantClick, onDishClick }: FoodLeadersProps = {}) {
  const { filters, update } = useFilters();
  const [searchQuery, setSearchQuery] = useState('');
  const [minimum, setMinimum] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [grouping, setGrouping] = useState<'merged' | 'listing'>('merged');
  const [restaurantPage, setRestaurantPage] = useState(1);
  const [dishPage, setDishPage] = useState(1);
  const [selectedDish, setSelectedDish] = useState<SelectedDish | null>(null);

  const [restaurantSort, setRestaurantSort] = useState<SortState>({
    key: 'amount',
    direction: 'desc',
  });

  const [dishSort, setDishSort] = useState<SortState>({
    key: 'amount',
    direction: 'desc',
  });

  const restaurants = useRestaurants({
    ...filters,
    search: searchQuery.trim() || undefined,
    sort: restaurantSort.key,
    direction: restaurantSort.direction,
    min_orders: minimum,
    grouping,
    page: restaurantPage,
    page_size: 25,
  });

  const items = useItems({
    ...filters,
    search: searchQuery.trim() || undefined,
    sort: dishSort.key,
    direction: dishSort.direction,
    min_qty: quantity,
    page: dishPage,
    page_size: 25,
  });

  const totalRestaurantPages = Math.max(1, Math.ceil((restaurants.data?.total ?? 0) / 25));
  const totalDishPages = Math.max(1, Math.ceil((items.data?.total ?? 0) / 25));

  // Process restaurants: filter and sort
  const processedRestaurants = useMemo(() => {
    const raw = (restaurants.data?.rows ?? []) as LeaderRow[];
    const filtered = filterLeaderRows(raw, searchQuery);
    return sortLeaderRows(filtered, restaurantSort.key, restaurantSort.direction);
  }, [restaurants.data?.rows, searchQuery, restaurantSort]);

  // Process dishes: filter and sort
  const processedDishes = useMemo(() => {
    const raw = (items.data?.rows ?? []) as LeaderRow[];
    const filtered = filterLeaderRows(raw, searchQuery);
    return sortLeaderRows(filtered, dishSort.key, dishSort.direction);
  }, [items.data?.rows, searchQuery, dishSort]);

  const restaurantDuplicates = useMemo(() => duplicateNames(processedRestaurants), [processedRestaurants]);

  // Max values for proportional bars in the current view
  const maxRestaurantAmount = useMemo(() => {
    return Math.max(1, ...processedRestaurants.map(r => r.amount));
  }, [processedRestaurants]);

  const maxDishAmount = useMemo(() => {
    return Math.max(1, ...processedDishes.map(d => d.amount));
  }, [processedDishes]);

  // Check if selected dish is present on the currently viewed page
  const dishInCurrentPage = processedDishes.find(x => x.key === selectedDish?.key);
  const currentSelection: SelectedDish | null = dishInCurrentPage
    ? {
        key: dishInCurrentPage.key,
        name: dishInCurrentPage.name,
        price_trend: dishInCurrentPage.price_trend ?? [],
      }
    : selectedDish;

  const handleSelectDish = (row: LeaderRow) => {
    setSelectedDish({
      key: row.key,
      name: row.name,
      price_trend: row.price_trend ?? [],
    });
    onDishClick?.(row);
  };

  const handleRestaurantRowClick = (row: LeaderRow) => {
    update({ restaurant_ids: [row.key] });
    onRestaurantClick?.(row);
  };

  const handleToggleRestaurantSort = (key: SortKey) => {
    setRestaurantSort(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: key === 'name' ? 'asc' : 'desc' };
    });
    setRestaurantPage(1);
  };

  const handleToggleDishSort = (key: SortKey) => {
    setDishSort(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: key === 'name' ? 'asc' : 'desc' };
    });
    setDishPage(1);
  };

  const isRestaurantSelected = (key: string) => {
    return filters.restaurant_ids?.includes(key) ?? false;
  };

  return (
    <>
      <div className="rounded-card border bg-card p-[var(--space-card)] space-y-4">
        <div className="border-b pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Restaurants and dishes</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Your most-ordered restaurants and dishes. Click a restaurant to filter the page, or a dish for its price history.
            </p>
          </div>

          {/* Search box (Scenario: Tables) */}
          <LeadersSearchInput
            value={searchQuery}
            onChange={val => {
              setSearchQuery(val);
              setRestaurantPage(1);
              setDishPage(1);
            }}
            onClear={() => {
              setSearchQuery('');
              setRestaurantPage(1);
              setDishPage(1);
            }}
          />
        </div>

        {/* Filter inputs and modern SegmentedControl */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <label className="flex flex-col gap-1 text-sm text-foreground">
            <span className="text-xs text-muted-foreground">Minimum restaurant orders</span>
            <input
              type="number"
              min="1"
              value={minimum}
              onChange={e => {
                setMinimum(Math.max(1, Number(e.target.value) || 1));
                setRestaurantPage(1);
              }}
              className="h-10 rounded-md border border-input bg-background px-2.5 text-sm tabular-nums"
            />
          </label>

          <div className="flex flex-col gap-1 text-sm text-foreground">
            <span className="text-xs text-muted-foreground">Restaurant grouping</span>
            <SegmentedControl
              options={[
                { value: 'merged', label: 'Name and locality' },
                { value: 'listing', label: 'Platform listing' },
              ]}
              value={grouping}
              onChange={v => {
                setGrouping(v as 'merged' | 'listing');
                setRestaurantPage(1);
              }}
              className="h-10"
            />
          </div>

          <label className="flex flex-col gap-1 text-sm text-foreground">
            <span className="text-xs text-muted-foreground">Minimum dish quantity</span>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={e => {
                setQuantity(Math.max(1, Number(e.target.value) || 1));
                setDishPage(1);
              }}
              className="h-10 rounded-md border border-input bg-background px-2.5 text-sm tabular-nums"
            />
          </label>
        </div>

        {/* Active restaurant filter badge */}
        {filters.restaurant_ids && filters.restaurant_ids.length > 0 && (
          <div className="flex items-center gap-2 text-sm bg-muted border rounded-md px-3 py-1.5 w-fit">
            <span className="text-muted-foreground">Active restaurant filter:</span>
            <span className="font-medium text-foreground">{filters.restaurant_ids.map(id => id.split('|')[0]).join(', ')}</span>
            <button
              type="button"
              onClick={() => update({ restaurant_ids: [] })}
              className="ml-1 inline-flex h-9 w-9 items-center justify-center text-muted-foreground hover:text-foreground rounded hover:bg-accent"
              aria-label="Clear active restaurant filter"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Tables */}
        <div className="grid grid-cols-1 gap-6 pt-2 xl:grid-cols-2">
          {/* Restaurants Table */}
          <section aria-busy={restaurants.isFetching} className="space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Restaurants</h3>
                {restaurants.data?.total != null && (
                  <span className="text-sm text-muted-foreground">{plural(restaurants.data.total, 'restaurant')}</span>
                )}
              </div>
              {restaurants.isError ? (
                <PageError what="Restaurants" onRetry={() => void restaurants.refetch()} />
              ) : restaurants.isPending ? (
                <p role="status" className="text-sm text-muted-foreground animate-pulse p-4">
                  Loading restaurants…
                </p>
              ) : (
                <div className="rounded-lg border">
                  <table className="w-full text-sm" data-testid="restaurants-table">
                    <thead className="border-b">
                      <tr>
                        <SortableColumnHeader
                          label="Name"
                          sortKey="name"
                          currentSortKey={restaurantSort.key}
                          currentDirection={restaurantSort.direction}
                          onSort={handleToggleRestaurantSort}
                          align="left"
                        />
                        <SortableColumnHeader
                          label="Orders"
                          sortKey="quantity"
                          currentSortKey={restaurantSort.key}
                          currentDirection={restaurantSort.direction}
                          onSort={handleToggleRestaurantSort}
                          align="right"
                        />
                        <SortableColumnHeader
                          label="Amount"
                          sortKey="amount"
                          currentSortKey={restaurantSort.key}
                          currentDirection={restaurantSort.direction}
                          onSort={handleToggleRestaurantSort}
                          align="right"
                        />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {processedRestaurants.map(x => (
                        <RestaurantRow
                          key={x.key}
                          row={x}
                          maxAmount={maxRestaurantAmount}
                          isSelected={isRestaurantSelected(x.key)}
                          onClick={() => handleRestaurantRowClick(x)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleRestaurantRowClick(x);
                            }
                          }}
                          showLocality={restaurantDuplicates.has(x.name)}
                        />
                      ))}
                    </tbody>
                  </table>
                  {!processedRestaurants.length && (
                    <p className="p-4 text-center text-sm text-muted-foreground" data-testid="no-restaurants-msg">
                      No restaurants match. Try a shorter search or a lower minimum.
                    </p>
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
                className="min-h-[44px] px-3 rounded-md border border-input bg-background text-sm font-medium hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
                aria-label="Previous restaurants page"
              >
                Previous restaurants
              </button>
              <span className="text-sm text-muted-foreground tabular-nums">
                Page {restaurantPage} of {totalRestaurantPages}
              </span>
              <button
                type="button"
                disabled={restaurantPage >= totalRestaurantPages}
                onClick={() => setRestaurantPage(p => p + 1)}
                className="min-h-[44px] px-3 rounded-md border border-input bg-background text-sm font-medium hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
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
                <h3 className="text-sm font-semibold text-foreground">Dishes</h3>
                {items.data?.total != null && (
                  <span className="text-sm text-muted-foreground">{plural(items.data.total, 'dish', 'dishes')}</span>
                )}
              </div>
              {items.isError ? (
                <PageError what="Dishes" onRetry={() => void items.refetch()} />
              ) : items.isPending ? (
                <p role="status" className="text-sm text-muted-foreground animate-pulse p-4">
                  Loading dishes…
                </p>
              ) : (
                <div className="rounded-lg border">
                  <table className="w-full text-sm" data-testid="dishes-table">
                    <thead className="border-b">
                      <tr>
                        <SortableColumnHeader
                          label="Name"
                          sortKey="name"
                          currentSortKey={dishSort.key}
                          currentDirection={dishSort.direction}
                          onSort={handleToggleDishSort}
                          align="left"
                        />
                        <SortableColumnHeader
                          label="Qty"
                          sortKey="quantity"
                          currentSortKey={dishSort.key}
                          currentDirection={dishSort.direction}
                          onSort={handleToggleDishSort}
                          align="right"
                        />
                        <SortableColumnHeader
                          label="Amount"
                          sortKey="amount"
                          currentSortKey={dishSort.key}
                          currentDirection={dishSort.direction}
                          onSort={handleToggleDishSort}
                          align="right"
                        />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {processedDishes.map(x => (
                        <DishRow
                          key={x.key}
                          row={x}
                          maxAmount={maxDishAmount}
                          isSelected={currentSelection?.key === x.key}
                          onClick={() => handleSelectDish(x)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleSelectDish(x);
                            }
                          }}
                          onFilterSearch={name => update({ search: name })}
                        />
                      ))}
                    </tbody>
                  </table>
                  {!processedDishes.length && (
                    <p className="p-4 text-center text-sm text-muted-foreground" data-testid="no-dishes-msg">
                      No dishes match. Try a shorter search or a lower minimum.
                    </p>
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
                className="min-h-[44px] px-3 rounded-md border border-input bg-background text-sm font-medium hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
                aria-label="Previous dishes page"
              >
                Previous dishes
              </button>
              <span className="text-sm text-muted-foreground tabular-nums">
                Page {dishPage} of {totalDishPages}
              </span>
              <button
                type="button"
                disabled={dishPage >= totalDishPages}
                onClick={() => setDishPage(p => p + 1)}
                className="min-h-[44px] px-3 rounded-md border border-input bg-background text-sm font-medium hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
                aria-label="Next dishes page"
              >
                Next dishes
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Dish unit price history panel */}
      {currentSelection && (
        <div className="rounded-card border bg-card p-[var(--space-card)] space-y-3" data-testid="dish-history-panel">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">
                  Unit price history: {currentSelection.name}
                </h2>
                {!dishInCurrentPage && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">
                    Retained from prior view
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                Quantity-weighted unit price by month. Gaps indicate months with no recorded orders for this item.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDish(null)}
              className="min-h-[44px] px-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
              aria-label="Clear selected dish history"
              data-testid="clear-dish-selection-btn"
            >
              Clear selection
            </button>
          </div>

          <Chart
            summary={`Quantity-weighted unit price by month for ${currentSelection.name}`}
            headers={['Month', 'Unit price (₹)', 'Quantity']}
            rows={currentSelection.price_trend.map(x => [
              x.month ?? '–',
              x.unit_price != null ? inr(x.unit_price, 2) : '–',
              x.quantity,
            ])}
            option={{
              tooltip: {
                trigger: 'axis',
                renderMode: 'richText',
                valueFormatter: (val: unknown) => (val != null ? inr(Number(val), 2) : '–'),
              },
              grid: { left: 56, right: 16, bottom: 32, top: 16 },
              xAxis: {
                type: 'category',
                data: currentSelection.price_trend.map(x => x.month ?? 'Unknown'),
                axisLabel: { hideOverlap: true, fontSize: 11 },
              },
              yAxis: {
                type: 'value',
                name: 'Unit price (₹)',
                axisLabel: { formatter: compactInr },
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
