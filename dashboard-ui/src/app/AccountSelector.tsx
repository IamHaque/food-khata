import { useEffect, useMemo, useRef, useState } from 'react';
import { useFilters } from './FilterContext';
import { useAccounts } from '../features/access/api';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Input } from '../components/ui/input';
import { Link } from 'react-router-dom';
import { Users, Search, Check, ChevronDown } from 'lucide-react';
import { platformLabel, pluralize } from '../lib/format';

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

/** `asLink`: outside the analytics pages the chip is a plain link to Accounts (no filter to pick). */
export function AccountSelector(props: { defaultOpen?: boolean; asLink?: boolean } = {}) {
  const { defaultOpen = false, asLink = false } = props;
  const { filters, update } = useFilters();
  const linked = useAccounts();
  const accounts: Account[] = useMemo(() => {
    // The API has one row per (account, provider); the filter is per account.
    const byId = new Map<string, Account>();
    for (const a of linked.data ?? []) {
      const name = platformLabel(a.provider);
      const seen = byId.get(a.local_id);
      if (seen) { seen.label = seen.label.replace(' ••••', ` + ${name} ••••`); seen.platforms.push(a.provider); seen.order_count += a.order_count; }
      else byId.set(a.local_id, { id: a.local_id, label: `${name} ••••${(a.phone ?? a.local_id).slice(-4)}`, platforms: [a.provider], order_count: a.order_count });
    }
    return [...byId.values()];
  }, [linked.data]);
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
    if (selected.length === 0) return accounts.length === 1 ? accounts[0].label : `All accounts (${accounts.length})`;
    if (selected.length === 1) {
      const match = accounts.find(a => a.id === selected[0]);
      return match ? match.label : selected[0];
    }
    return `${selected.length} accounts selected`;
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

  const chip = 'inline-flex items-center gap-1.5 min-h-[44px] md:min-h-[36px] rounded-md px-1.5 text-sm font-medium text-foreground min-w-0 max-w-full hover:bg-accent';
  if (!linked.data) return null;
  if (accounts.length === 0 || asLink || (accounts.length === 1 && selected.length <= 1)) {
    const text = accounts.length === 0 ? 'Link an account' : accounts.length === 1 ? accounts[0].label : triggerLabel;
    return (
      <Link to="/accounts" className={chip} title={text} aria-label={`Accounts: ${text}`}>
        <Users className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
        <span className="truncate">{text}</span>
      </Link>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Account"
          className="inline-flex items-center gap-1.5 min-h-[44px] lg:min-h-[36px] rounded-md border border-input bg-background px-2.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors text-foreground max-w-full"
        >
          <Users className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
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
              placeholder="Search accounts"
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
            title="Covers only the accounts you have linked while signed in"
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm min-h-[44px] transition-colors text-left ${
              activeIndex === 0 ? 'bg-accent' : 'hover:bg-accent/50'
            }`}
          >
            <span className="h-8 w-8 shrink-0 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-foreground">
              All
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-foreground">All accounts ({accounts.length})</div>
              <div className="text-xs text-muted-foreground">All platforms</div>
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
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm min-h-[44px] transition-colors text-left ${
                  activeIndex === index ? 'bg-accent' : 'hover:bg-accent/50'
                }`}
              >
                <span className="h-8 w-8 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                  {initials(a.label)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-foreground truncate">{a.label}</div>
                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                    <span className="text-xs text-muted-foreground">{pluralize(a.order_count, 'order')}</span>
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
        <Link to="/accounts" onClick={() => setOpen(false)} className="block border-t px-3 py-2.5 text-sm font-medium text-primary hover:bg-accent min-h-[44px] leading-[28px]">
          Manage accounts
        </Link>
      </PopoverContent>
    </Popover>
  );
}