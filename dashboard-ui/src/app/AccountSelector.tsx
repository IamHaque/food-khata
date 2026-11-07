import { useState } from 'react';
import { useFilters } from './FilterContext';
import { Users, Search, X } from 'lucide-react';

export function AccountSelector() {
  const { filters, update, metadata } = useFilters();
  const [search, setSearch] = useState('');
  const accounts = metadata.data?.all_accounts ?? [];
  const selectedCount = filters.account_ids.length;

  if (accounts.length === 1) {
    const a = accounts[0];
    return (
      <p className="text-xs font-medium text-foreground py-1">
        Account: {a.label} ({a.platforms.join('/')})
      </p>
    );
  }

  const isMulti = selectedCount > 1;

  return (
    <div className="account-controls flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <div className="relative hidden md:block shrink-0">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <label className="sr-only" htmlFor="search-accounts-input">Search accounts</label>
          <input
            id="search-accounts-input"
            type="search"
            aria-label="Search accounts"
            placeholder="Filter accounts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="min-h-[36px] w-28 lg:w-36 rounded-md border border-input bg-background pl-8 pr-2 py-0.5 text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
          />
        </div>

        <div className="flex items-center gap-1 min-w-0">
          <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0 hidden sm:block" />
          <select
            aria-label="Account"
            value={isMulti ? '__multi__' : (filters.account_ids[0] ?? '')}
            onChange={e => {
              if (e.target.value === '__multi__') return;
              update({ account_ids: e.target.value ? [e.target.value] : [] });
            }}
            className="min-h-[44px] sm:min-h-[36px] rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium shadow-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground max-w-[160px] sm:max-w-[240px] md:max-w-[320px] truncate cursor-pointer"
          >
            {isMulti && (
              <option value="__multi__" disabled>
                {selectedCount} accounts selected
              </option>
            )}
            <option value="">All accounts</option>
            {accounts
              .filter(
                a =>
                  `${a.label} ${a.id} ${a.platforms.join(' ')}`.toLowerCase().includes(search.toLowerCase()) ||
                  filters.account_ids.includes(a.id)
              )
              .map(a => (
                <option key={a.id} value={a.id} title={`${a.label} (${a.platforms.join('/')}) · ${a.order_count} orders`}>
                  {a.label} ({a.platforms.join('/')})
                </option>
              ))}
          </select>
        </div>
      </div>

      {isMulti && (
        <div className="flex flex-wrap items-center gap-1 text-xs" aria-label="Active account filters">
          {filters.account_ids.map(id => {
            const match = accounts.find(a => a.id === id);
            const label = match ? match.label : id;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-muted/60 text-foreground font-medium"
              >
                <span>{label}</span>
                <button
                  type="button"
                  aria-label={`Remove account ${label}`}
                  onClick={() => update({ account_ids: filters.account_ids.filter(x => x !== id) })}
                  className="text-muted-foreground hover:text-foreground min-h-[20px] min-w-[20px] inline-flex items-center justify-center"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
