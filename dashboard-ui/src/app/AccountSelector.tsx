import { useEffect, useMemo, useRef, useState } from 'react';
import { useFilters } from './FilterContext';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Input } from '../components/ui/input';
import { Users, Search, Check } from 'lucide-react';

type Account = {
  id: string;
  label: string;
  platforms: string[];
  order_count: number;
};

function initials(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

export function AccountSelector(props: { defaultOpen?: boolean } = {}) {
  const { defaultOpen = false } = props;
  const { filters, update, metadata } = useFilters();
  const accounts = (metadata.data?.all_accounts ?? []) as Account[];
  const selected = filters.account_ids ?? [];

  const [open, setOpen] = useState(defaultOpen);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(a =>
      `${a.label} ${a.id} ${a.platforms.join(' ')}`.toLowerCase().includes(q),
    );
  }, [accounts, search]);

  const items = useMemo(
    () => [{ kind: 'all' as const }, ...filteredAccounts.map(a => ({ kind: 'account' as const, account: a }))],
    [filteredAccounts],
  );

  useEffect(() => {
    if (!open) {
      setSearch('');
      setActiveIndex(0);
    }
  }, [open]);

  const triggerLabel = useMemo(() => {
    if (selected.length === 0) return 'All Accounts';
    if (selected.length === 1) {
      const match = accounts.find(a => a.id === selected[0]);
      return match ? match.label : selected[0];
    }
    return `${selected.length} Accounts selected`;
  }, [selected, accounts]);

  function toggleAll() {
    update({ account_ids: [] });
  }

  function toggleAccount(id: string) {
    if (selected.length === 0) {
      update({ account_ids: [id] });
      return;
    }
    if (selected.includes(id)) {
      const next = selected.filter(x => x !== id);
      update({ account_ids: next });
    } else {
      update({ account_ids: [...selected, id] });
    }
  }

  function toggleItem(index: number) {
    const item = items[index];
    if (!item) return;
    if (item.kind === 'all') toggleAll();
    else toggleAccount(item.account.id);
  }

  function focusItem(index: number) {
    const clamped = Math.max(0, Math.min(items.length - 1, index));
    setActiveIndex(clamped);
    itemRefs.current[clamped]?.focus();
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusItem(items.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items.length > 0) toggleItem(activeIndex >= 0 ? activeIndex : 0);
    }
  };

  const handleItemKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusItem(index + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (index === 0) {
        searchInputRef.current?.focus();
        setActiveIndex(-1);
      } else {
        focusItem(index - 1);
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleItem(index);
    }
  };

  if (accounts.length === 1 && selected.length <= 1) {
    const a = accounts[0];
    return (
      <p className="text-xs font-medium text-foreground py-1">
        Account: {a.label} ({a.platforms.join('/')})
      </p>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Account"
          className="inline-flex items-center gap-1.5 min-h-[36px] rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium shadow-xs hover:bg-accent hover:text-accent-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground max-w-[240px] truncate"
        >
          <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{triggerLabel}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0"
        align="start"
        onOpenAutoFocus={e => {
          e.preventDefault();
          searchInputRef.current?.focus();
        }}
      >
        <div className="p-3 border-b">
          <h3 className="text-sm font-semibold text-foreground">Accounts</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Select one or more accounts</p>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchInputRef}
              type="search"
              aria-label="Search accounts"
              placeholder="Search accounts..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="pl-8 h-8 text-xs"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto p-1" role="listbox" aria-label="Accounts">
          {/* All Accounts */}
          <button
            type="button"
            ref={el => { itemRefs.current[0] = el; }}
            role="option"
            aria-selected={selected.length === 0}
            onClick={() => toggleAll()}
            onKeyDown={e => handleItemKeyDown(e, 0)}
            onFocus={() => setActiveIndex(0)}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs transition-colors text-left ${
              activeIndex === 0 ? 'bg-accent' : 'hover:bg-accent/50'
            }`}
          >
            <span className="h-8 w-8 shrink-0 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-foreground">
              All
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-foreground">All Accounts</div>
              <div className="text-[10px] text-muted-foreground">All platforms</div>
            </div>
            {selected.length === 0 && <Check className="h-4 w-4 text-primary shrink-0" />}
          </button>

          {filteredAccounts.map((a, i) => {
            const index = i + 1;
            const checked = selected.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                ref={el => { itemRefs.current[index] = el; }}
                role="option"
                aria-selected={checked}
                onClick={() => toggleAccount(a.id)}
                onKeyDown={e => handleItemKeyDown(e, index)}
                onFocus={() => setActiveIndex(index)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs transition-colors text-left ${
                  activeIndex === index ? 'bg-accent' : 'hover:bg-accent/50'
                }`}
              >
                <span className="h-8 w-8 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                  {initials(a.label)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-foreground truncate">{a.label}</div>
                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                    {a.platforms.map(p => (
                      <span
                        key={p}
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground"
                      >
                        {p}
                      </span>
                    ))}
                    <span className="text-[10px] text-muted-foreground ml-1">{a.order_count} orders</span>
                  </div>
                </div>
                {checked && <Check className="h-4 w-4 text-primary shrink-0" />}
              </button>
            );
          })}

          {filteredAccounts.length === 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground">No accounts found.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}