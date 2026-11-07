import { useEffect, useMemo, useState } from 'react';
import { useFilters } from './FilterContext';
import {
  defaultFilters,
  validateFilters,
  calculatePresetDates,
  detectPreset,
  type FilterState,
} from '../lib/filters';
import { SlidersHorizontal, Search } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover';
import { Badge } from '../components/ui/badge';
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { Chip } from '../components/ui/chip';

function Amount({
  field,
  label,
  value,
  onChange,
}: {
  field: 'amount_min' | 'amount_max';
  label: string;
  value: number | null;
  onChange: (val: number | null) => void;
}) {
  const [localVal, setLocalVal] = useState(value?.toString() ?? '');

  useEffect(() => {
    setLocalVal(value?.toString() ?? '');
  }, [value]);

  useEffect(() => {
    const id = setTimeout(() => {
      const parsed = localVal.trim() === '' ? null : Number(localVal);
      if (parsed === null || Number.isFinite(parsed)) {
        if (parsed !== value) {
          onChange(parsed);
        }
      }
    }, 250);
    return () => clearTimeout(id);
  }, [localVal, value, onChange]);

  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="relative">
        <span className="absolute left-2.5 top-2 text-xs text-muted-foreground pointer-events-none">$</span>
        <input
          type="number"
          name={field}
          aria-label={label}
          value={localVal}
          onChange={e => setLocalVal(e.target.value)}
          className="h-8 w-full rounded-md border border-input bg-background pl-6 pr-2.5 text-xs font-mono shadow-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
          placeholder="Any"
        />
      </div>
    </label>
  );
}

interface MultiSelectFilterProps {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}

function MultiSelectFilter({ label, options, selected, onChange }: MultiSelectFilterProps) {
  const [search, setSearch] = useState('');

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const lower = search.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(lower));
  }, [options, search]);

  function toggleOption(val: string) {
    if (selected.includes(val)) {
      onChange(selected.filter(v => v !== val));
    } else {
      onChange([...selected, val]);
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${selected.length ? `${selected.length} selected` : 'All'}`}
          className="flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium shadow-xs hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
        >
          <span className="truncate">{label}</span>
          <span
            className={`ml-1 text-xs px-1.5 py-0.2 rounded-full font-bold shrink-0 ${
              selected.length > 0 ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
            }`}
          >
            {selected.length > 0 ? selected.length : 'All'}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2.5 space-y-2 bg-popover text-popover-foreground shadow-md rounded-md border border-border" align="start">
        <div className="flex items-center justify-between border-b pb-1.5">
          <span className="text-xs font-semibold">{label}</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onChange(options.map(o => o.value))}
              className="text-xs font-medium text-primary hover:underline"
            >
              All
            </button>
            <span className="text-muted-foreground text-xs">|</span>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              Clear
            </button>
          </div>
        </div>
        {options.length > 6 && (
          <div className="relative">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              placeholder={`Filter ${label.toLowerCase()}...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-7 w-full rounded border border-input bg-background pl-7 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        )}
        <div className="max-h-48 overflow-y-auto space-y-0.5 select-custom-scroll">
          {filteredOptions.length === 0 ? (
            <p className="p-2 text-xs text-muted-foreground text-center">No options found</p>
          ) : (
            filteredOptions.map(opt => {
              const isChecked = selected.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-xs select-none min-h-[30px]"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleOption(opt.value)}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-1 focus:ring-ring shrink-0"
                  />
                  <span className="truncate">{opt.label}</span>
                </label>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FilterBar() {
  const { filters, update, clear, notice, clearNotice, metadata } = useFilters();
  const meta = metadata.data;
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const [dateError, setDateError] = useState('');
  const [amountError, setAmountError] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);

  function clearMessages() {
    if (saved) setSaved('');
    if (error) setError('');
    if (notice) clearNotice();
  }

  function handleClear() {
    clearMessages();
    setDateError('');
    setAmountError('');
    clear();
  }

  function handleSavePreset() {
    clearMessages();
    try {
      localStorage.setItem('food-khata-preset', JSON.stringify(filters));
      setSaved('Preset saved successfully');
      setError('');
    } catch {
      setError('Could not save preset');
      setSaved('');
    }
  }

  function handleLoadPreset() {
    clearMessages();
    try {
      const raw = localStorage.getItem('food-khata-preset');
      if (raw) {
        const candidate: unknown = JSON.parse(raw);
        const valid = validateFilters(candidate);
        update(valid);
        setSaved('Preset loaded successfully');
        setError('');
      } else {
        setError('No saved preset found');
        setSaved('');
      }
    } catch {
      setError('Could not load preset');
      setSaved('');
    }
  }

  function handleDateFromChange(val: string) {
    clearMessages();
    const nextFrom = val || null;
    if (nextFrom && filters.date_to && nextFrom > filters.date_to) {
      setDateError(`From date (${nextFrom}) cannot be after to date (${filters.date_to})`);
    } else {
      setDateError('');
      update({ date_from: nextFrom });
    }
  }

  function handleDateToChange(val: string) {
    clearMessages();
    const nextTo = val || null;
    if (filters.date_from && nextTo && filters.date_from > nextTo) {
      setDateError(`From date (${filters.date_from}) cannot be after to date (${nextTo})`);
    } else {
      setDateError('');
      update({ date_to: nextTo });
    }
  }

  function handleAmountMinChange(minVal: number | null) {
    clearMessages();
    if (minVal !== null && filters.amount_max !== null && minVal > filters.amount_max) {
      setAmountError(`Minimum amount (${minVal}) cannot exceed maximum amount (${filters.amount_max})`);
    } else {
      setAmountError('');
      update({ amount_min: minVal });
    }
  }

  function handleAmountMaxChange(maxVal: number | null) {
    clearMessages();
    if (maxVal !== null && filters.amount_min !== null && maxVal < filters.amount_min) {
      setAmountError(`Maximum amount (${maxVal}) cannot be less than minimum amount (${filters.amount_min})`);
    } else {
      setAmountError('');
      update({ amount_max: maxVal });
    }
  }

  const lists: ('restaurant_ids' | 'cities' | 'localities' | 'cuisines' | 'payment_methods')[] = [
    'restaurant_ids',
    'cities',
    'localities',
    'cuisines',
    'payment_methods',
  ];

  const labels = {
    restaurant_ids: 'Restaurants',
    cities: 'Cities',
    localities: 'Localities',
    cuisines: 'Cuisines',
    payment_methods: 'Payment methods',
  };

  const active = Object.entries(filters).filter(
    ([key, value]) =>
      !['account_ids'].includes(key) &&
      (Array.isArray(value)
        ? value.length > 0 && !(key === 'statuses' && value.join() === 'DELIVERED')
        : value !== null && value !== false && value !== 'all' && value !== 'none')
  );

  const advancedKeys = [
    'veg',
    'amount_min',
    'amount_max',
    'day_type',
    'statuses',
    'restaurant_ids',
    'cities',
    'localities',
    'cuisines',
    'payment_methods',
    'meal_slots',
    'verified_only',
    'anomaly',
  ];
  const advancedActiveCount = active.filter(([key]) => advancedKeys.includes(key)).length;

  return (
    <section aria-label="Global filters" className="filter-panel rounded-xl border bg-card p-4 sm:p-5 shadow-xs space-y-4">
      {/* Summary row */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Date preset */}
        <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
          <span className="text-xs text-muted-foreground">Date preset</span>
          <select
            aria-label="Date preset"
            value={detectPreset(filters.date_from, filters.date_to)}
            onChange={e => {
              clearMessages();
              setDateError('');
              const val = e.target.value;
              if (val === 'custom') return;
              const dates = calculatePresetDates(val);
              update(dates);
            }}
            className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
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
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>

        {/* From date */}
        <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
          <span className="text-xs text-muted-foreground">From date</span>
          <input
            type="date"
            aria-label="From date"
            value={filters.date_from ?? ''}
            onChange={e => handleDateFromChange(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs font-mono shadow-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
          />
        </label>

        {/* To date */}
        <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
          <span className="text-xs text-muted-foreground">To date</span>
          <input
            type="date"
            aria-label="To date"
            value={filters.date_to ?? ''}
            onChange={e => handleDateToChange(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs font-mono shadow-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
          />
        </label>

        {/* Platform */}
        <div className="flex flex-col gap-1 text-xs font-medium text-foreground min-w-[160px]">
          <span className="text-xs text-muted-foreground">Platform</span>
          <MultiSelectFilter
            label="Platforms"
            options={(meta?.platforms ?? []).map(v => ({ value: v, label: v }))}
            selected={filters.platforms}
            onChange={selected => {
              clearMessages();
              update({ platforms: selected });
            }}
          />
        </div>

        {/* Compare */}
        <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
          <span className="text-xs text-muted-foreground">Compare</span>
          <select
            aria-label="Compare"
            value={filters.compare}
            onChange={e => {
              clearMessages();
              update({ compare: e.target.value as FilterState['compare'] });
            }}
            className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
          >
            {['none', 'previous_period', 'previous_year'].map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>

        {/* More filters */}
        <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-2 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-xs hover:bg-accent text-foreground"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              More filters
              {advancedActiveCount > 0 && (
                <Badge variant="default" className="text-xs h-4 px-1.5 font-bold">
                  {advancedActiveCount} active
                </Badge>
              )}
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle>More filters</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 pt-4">
              {/* Amounts */}
              <div className="grid grid-cols-2 gap-3">
                <Amount field="amount_min" label="Minimum amount" value={filters.amount_min} onChange={handleAmountMinChange} />
                <Amount field="amount_max" label="Maximum amount" value={filters.amount_max} onChange={handleAmountMaxChange} />
              </div>

              {/* Diet */}
              <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
                <span className="text-xs text-muted-foreground">Diet</span>
                <select
                  aria-label="Diet"
                  value={filters.veg}
                  onChange={e => { clearMessages(); update({ veg: e.target.value as FilterState['veg'] }); }}
                  className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
                >
                  {['all', 'veg', 'nonveg', 'unknown'].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>

              {/* Day type */}
              <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
                <span className="text-xs text-muted-foreground">Day type</span>
                <select
                  aria-label="Day type"
                  value={filters.day_type}
                  onChange={e => { clearMessages(); update({ day_type: e.target.value as FilterState['day_type'] }); }}
                  className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
                >
                  {['all', 'weekday', 'weekend'].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>

              {/* Status */}
              <div className="flex flex-col gap-1 text-xs font-medium text-foreground">
                <span className="text-xs text-muted-foreground">Statuses</span>
                <MultiSelectFilter
                  label="Statuses"
                  options={(meta?.statuses ?? []).map(v => ({ value: v, label: v }))}
                  selected={filters.statuses}
                  onChange={selected => { clearMessages(); update({ statuses: selected }); }}
                />
              </div>

              {/* Verified only */}
              <label className="check flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  aria-label="Verified only"
                  checked={filters.verified_only}
                  onChange={e => { clearMessages(); update({ verified_only: e.target.checked }); }}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-1 focus:ring-ring"
                />
                <span>Verified only</span>
              </label>

              {/* Anomaly */}
              <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
                <span className="text-xs text-muted-foreground">Anomaly</span>
                <select
                  aria-label="Anomaly"
                  value={filters.anomaly}
                  onChange={e => { clearMessages(); update({ anomaly: e.target.value as FilterState['anomaly'] }); }}
                  className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
                >
                  {['all', 'review'].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>

              {/* Categorical multiselects */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Categorical scopes</div>
                <div className="grid grid-cols-1 gap-2.5">
                  {lists.map(key => {
                    const options =
                      key === 'restaurant_ids'
                        ? meta?.restaurants.map(r => ({ value: r.id, label: r.name })) ?? []
                        : (meta?.[key] ?? []).map(v => ({ value: v, label: v }));
                    return (
                      <div key={key} className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground truncate">{labels[key]}</span>
                        <MultiSelectFilter
                          label={labels[key]}
                          options={options}
                          selected={filters[key]}
                          onChange={selected => { clearMessages(); update({ [key]: selected }); }}
                        />
                      </div>
                    );
                  })}

                  {/* Meal slots */}
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground truncate">Meal slots</span>
                    <MultiSelectFilter
                      label="Meal slots"
                      options={['breakfast', 'lunch', 'snack', 'dinner', 'late_night'].map(v => ({
                        value: v,
                        label: v.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
                      }))}
                      selected={filters.meal_slots}
                      onChange={selected => { clearMessages(); update({ meal_slots: selected as FilterState['meal_slots'] }); }}
                    />
                  </div>
                </div>
              </div>

              {amountError && (
                <p role="alert" className="text-xs font-semibold text-destructive">{amountError}</p>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {dateError && (
        <p role="alert" className="text-xs font-semibold text-destructive">{dateError}</p>
      )}

      {/* Chips */}
      <div className="chips flex flex-wrap items-center gap-1.5 pt-3 border-t">
        {active.map(([key, value]) => {
          const displayVal = Array.isArray(value) ? value.join(', ') : String(value);
          return (
            <Chip
              key={key}
              label={`${key.replaceAll('_', ' ')}: ${displayVal}`}
              active
              onRemove={() => {
                clearMessages();
                update({ [key]: defaultFilters()[key as keyof FilterState] });
              }}
            />
          );
        })}

        <button
          type="button"
          onClick={handleClear}
          className="rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors min-h-[32px]"
        >
          Clear all
        </button>

        <button
          type="button"
          onClick={handleSavePreset}
          className="rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors min-h-[32px]"
        >
          Save preset
        </button>

        <button
          type="button"
          onClick={handleLoadPreset}
          className="rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors min-h-[32px]"
        >
          Load preset
        </button>
      </div>

      {saved && (
        <p role="status" className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{saved}</p>
      )}
      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">{error}</p>
      )}
    </section>
  );
}

