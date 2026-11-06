import { useState } from 'react';
import { useFilters } from './FilterContext';
import { Users, Search } from 'lucide-react';

export function AccountSelector() {
  const { filters, update, metadata } = useFilters();
  const [search, setSearch] = useState('');
  const accounts = metadata.data?.all_accounts ?? [];

  if (accounts.length === 1) {
    return (
      <p className="text-xs font-medium text-foreground py-1">
        Account: {accounts[0].label} · {accounts[0].id} · {accounts[0].order_count} orders
      </p>
    );
  }

  return (
    <div className="account-controls flex items-center gap-1.5 min-w-0">
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
          className="h-8 w-28 lg:w-36 rounded-md border border-input bg-background pl-8 pr-2 py-0.5 text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
        />
      </div>

      <div className="flex items-center gap-1 min-w-0">
        <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0 hidden sm:block" />
        <select
          aria-label="Account"
          value={filters.account_ids[0] ?? ''}
          onChange={e => update({ account_ids: e.target.value ? [e.target.value] : [] })}
          className="h-8 rounded-md border border-input bg-background px-2 py-0.5 text-xs font-medium shadow-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground max-w-[140px] sm:max-w-[240px] md:max-w-[320px] truncate"
        >
          <option value="">All accounts</option>
          {accounts
            .filter(
              a =>
                `${a.label} ${a.id} ${a.platforms.join(' ')}`.toLowerCase().includes(search.toLowerCase()) ||
                filters.account_ids.includes(a.id)
            )
            .map(a => (
              <option key={a.id} value={a.id}>
                {a.label} · {a.id} · {a.platforms.join('/')} · {a.order_count} orders · {a.date_from ?? 'Unknown'}–
                {a.date_to ?? 'Unknown'}
              </option>
            ))}
        </select>
      </div>
    </div>
  );
}
