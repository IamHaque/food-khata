import { useEffect, useState } from 'react';
import { useFilters } from './FilterContext';
import { defaultFilters, validateFilters, type FilterState } from '../lib/filters';
import { SlidersHorizontal, Search } from 'lucide-react';

function Amount({ field, label }: { field: 'amount_min' | 'amount_max'; label: string }) {
  const { filters, update } = useFilters();
  const [value, setValue] = useState(filters[field]?.toString() ?? '');

  useEffect(() => setValue(filters[field]?.toString() ?? ''), [filters, field]);

  useEffect(() => {
    const id = setTimeout(() => {
      const amount = value === '' ? null : Number(value);
      if (amount !== filters[field] && (amount === null || Number.isFinite(amount))) {
        if (field === 'amount_min' && amount !== null && filters.amount_max !== null && amount > filters.amount_max) return;
        if (field === 'amount_max' && amount !== null && filters.amount_min !== null && amount < filters.amount_min) return;
        update({ [field]: amount });
      }
    }, 250);
    return () => clearTimeout(id);
  }, [value, field, filters, update]);

  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="relative">
        <span className="absolute left-2.5 top-2 text-xs text-muted-foreground">₹</span>
        <input
          type="number"
          aria-label={label}
          value={value}
          onChange={e => setValue(e.target.value)}
          className="h-8 w-full rounded-md border border-input bg-background pl-6 pr-2.5 text-xs font-mono shadow-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
          placeholder="Any"
        />
      </div>
    </label>
  );
}

export function FilterBar() {
  const { filters, update, clear, metadata } = useFilters();
  const meta = metadata.data;
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  const lists: ('platforms' | 'statuses' | 'restaurant_ids' | 'cities' | 'localities' | 'cuisines' | 'payment_methods')[] = [
    'platforms',
    'statuses',
    'restaurant_ids',
    'cities',
    'localities',
    'cuisines',
    'payment_methods',
  ];

  const labels = {
    platforms: 'Platforms',
    statuses: 'Statuses',
    restaurant_ids: 'Restaurants',
    cities: 'Cities',
    localities: 'Localities',
    cuisines: 'Cuisines',
    payment_methods: 'Payment methods',
  };

  function preset(name: string) {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let start = new Date(end);
    if (name === 'all') {
      update({ date_from: null, date_to: null });
      return;
    }
    if (name === 'custom') return;
    if (name === '7d' || name === '30d' || name === '90d') start.setDate(start.getDate() - Number(name.slice(0, -1)) + 1);
    if (name === 'month') start = new Date(now.getFullYear(), now.getMonth(), 1);
    if (name === 'last_month') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end.setDate(0);
    }
    if (name === 'year') start = new Date(now.getFullYear(), 0, 1);
    if (name === 'fy') start = new Date(now.getFullYear() - (now.getMonth() < 3 ? 1 : 0), 3, 1);
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    update({ date_from: iso(start), date_to: iso(end) });
  }

  const active = Object.entries(filters).filter(
    ([key, value]) =>
      !['account_ids'].includes(key) &&
      (Array.isArray(value)
        ? value.length > 0 && !(key === 'statuses' && value.join() === 'DELIVERED')
        : value !== null && value !== false && value !== 'all' && value !== 'none')
  );

  return (
    <section aria-label="Global filters" className="filter-panel rounded-xl border bg-card p-4 sm:p-5 shadow-xs">
      <details open className="group space-y-4">
        {/* Header Toolbar */}
        <summary className="flex items-center gap-2.5 cursor-pointer select-none border-b pb-3">
          <SlidersHorizontal className="h-4 w-4 text-primary shrink-0" />
          <span className="font-semibold text-sm text-foreground">Filters · {active.length} active</span>
        </summary>

        {/* Primary Row: Search, Preset, Dates, Diet, Verified */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Search */}
          <label className="flex flex-col gap-1 sm:col-span-2 text-xs font-medium text-foreground">
            <span className="text-[11px] text-muted-foreground">Search restaurant or item</span>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                aria-label="Search restaurant or item"
                type="search"
                placeholder="Dishes, places, keywords..."
                value={filters.search ?? ''}
                onChange={e => update({ search: e.target.value || null })}
                className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2.5 text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
              />
            </div>
          </label>

          {/* Date Preset */}
          <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
            <span className="text-[11px] text-muted-foreground">Date preset</span>
            <div className="relative">
              <select
                aria-label="Date preset"
                defaultValue="custom"
                onChange={e => preset(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
              >
                {[
                  ['7d', 'Last 7 days'],
                  ['30d', 'Last 30 days'],
                  ['90d', 'Last 90 days'],
                  ['month', 'This month'],
                  ['last_month', 'Last month'],
                  ['fy', 'This FY'],
                  ['year', 'YTD'],
                  ['all', 'All time'],
                  ['custom', 'Custom'],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </label>

          {/* From date */}
          <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
            <span className="text-[11px] text-muted-foreground">From date</span>
            <input
              type="date"
              aria-label="From date"
              max={filters.date_to ?? undefined}
              value={filters.date_from ?? ''}
              onChange={e => update({ date_from: e.target.value || null })}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs font-mono shadow-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
            />
          </label>

          {/* To date */}
          <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
            <span className="text-[11px] text-muted-foreground">To date</span>
            <input
              type="date"
              aria-label="To date"
              min={filters.date_from ?? undefined}
              value={filters.date_to ?? ''}
              onChange={e => update({ date_to: e.target.value || null })}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs font-mono shadow-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
            />
          </label>

          {/* Diet */}
          <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
            <span className="text-[11px] text-muted-foreground">Diet</span>
            <select
              aria-label="Diet"
              value={filters.veg}
              onChange={e => update({ veg: e.target.value as FilterState['veg'] })}
              className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
            >
              {['all', 'veg', 'nonveg', 'unknown'].map(v => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Secondary Grid: Amounts, Day type, Compare, Verified */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 pt-2">
          <Amount field="amount_min" label="Minimum amount" />
          <Amount field="amount_max" label="Maximum amount" />

          <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
            <span className="text-[11px] text-muted-foreground">Day type</span>
            <select
              aria-label="Day type"
              value={filters.day_type}
              onChange={e => update({ day_type: e.target.value as FilterState['day_type'] })}
              className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
            >
              {['all', 'weekday', 'weekend'].map(v => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
            <span className="text-[11px] text-muted-foreground">Compare</span>
            <select
              aria-label="Compare"
              value={filters.compare}
              onChange={e => update({ compare: e.target.value as FilterState['compare'] })}
              className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
            >
              {['none', 'previous_period', 'previous_year'].map(v => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end pb-1.5 col-span-2 sm:col-span-1">
            <label className="check flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                aria-label="Verified only"
                checked={filters.verified_only}
                onChange={e => update({ verified_only: e.target.checked })}
                className="h-4 w-4 rounded border-input text-primary focus:ring-1 focus:ring-ring"
              />
              <span>Verified only</span>
            </label>
          </div>
        </div>

        {/* Detailed Multi-selects (Platforms, Statuses, Restaurants, Cities, Localities, Cuisines, Payment methods, Meal slots) */}
        <div className="border-t pt-3">
          <div className="text-[11px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
            Detailed Categorical Scopes
          </div>
          <div className="filter-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-2.5">
            {lists.map(key => {
              const options =
                key === 'restaurant_ids'
                  ? meta?.restaurants.map(r => ({ value: r.id, label: r.name })) ?? []
                  : (meta?.[key] ?? []).map(v => ({ value: v, label: v }));
              const count = filters[key].length;
              return (
                <label key={key} className="flex flex-col gap-1 text-xs font-medium text-foreground">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="truncate">{labels[key]}</span>
                    {count > 0 && (
                      <span className="text-[10px] bg-primary/15 text-primary font-bold px-1.5 py-0.2 rounded-full">
                        {count}
                      </span>
                    )}
                  </div>
                  <select
                    multiple
                    value={filters[key]}
                    onChange={e =>
                      update({ [key]: Array.from(e.target.selectedOptions, o => o.value) })
                    }
                    aria-label={labels[key]}
                    className="h-20 w-full rounded-md border border-input bg-background/50 p-1 text-xs shadow-2xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground select-custom-scroll"
                  >
                    {options.map(o => (
                      <option key={o.value} value={o.value} className="px-1.5 py-0.5 rounded text-[11px] hover:bg-accent">
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}

            {/* Meal slots */}
            <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="truncate">Meal slots</span>
                {filters.meal_slots.length > 0 && (
                  <span className="text-[10px] bg-primary/15 text-primary font-bold px-1.5 py-0.2 rounded-full">
                    {filters.meal_slots.length}
                  </span>
                )}
              </div>
              <select
                multiple
                value={filters.meal_slots}
                onChange={e =>
                  update({
                    meal_slots: Array.from(e.target.selectedOptions, o => o.value) as FilterState['meal_slots'],
                  })
                }
                aria-label="Meal slots"
                className="h-20 w-full rounded-md border border-input bg-background/50 p-1 text-xs shadow-2xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground select-custom-scroll"
              >
                {['breakfast', 'lunch', 'snack', 'dinner', 'late_night'].map(v => (
                  <option key={v} value={v} className="px-1.5 py-0.5 rounded text-[11px] hover:bg-accent capitalize">
                    {v.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Active Filter Chips */}
        <div className="chips flex flex-wrap items-center gap-1.5 pt-3 border-t">
          {active.map(([key, value]) => (
            <button
              key={key}
              onClick={() => update({ [key]: defaultFilters()[key as keyof FilterState] })}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors"
            >
              <span className="text-muted-foreground capitalize">{key.replaceAll('_', ' ')}:</span>
              <span className="font-semibold">{String(value)}</span>
              <span className="text-muted-foreground hover:text-destructive text-sm font-bold ml-0.5">×</span>
            </button>
          ))}
          <button
            onClick={clear}
            className="rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Clear filters
          </button>
          <button
            onClick={() => {
              try {
                localStorage.setItem('food-khata-preset', JSON.stringify(filters));
                setSaved('Preset saved');
              } catch {
                setError('Could not save preset');
              }
            }}
            className="rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Save preset
          </button>
          <button
            onClick={() => {
              try {
                const raw = localStorage.getItem('food-khata-preset');
                if (raw) {
                  const candidate: unknown = JSON.parse(raw);
                  update(validateFilters(candidate));
                  setSaved('Preset loaded');
                }
              } catch {
                setError('Could not load preset');
              }
            }}
            className="rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Load preset
          </button>
        </div>

        {saved && (
          <p role="status" className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            {saved}
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs font-medium text-destructive">
            {error}
          </p>
        )}
      </details>
    </section>
  );
}
