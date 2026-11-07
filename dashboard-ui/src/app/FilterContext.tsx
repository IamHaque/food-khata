import {createContext,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {useSearchParams,useLocation} from 'react-router-dom';
import {useMetadata} from '../hooks/api';
import {defaultFilters,parseFilters,serializeFilters,sanitizeAccountFilters,hasActiveFilters,type FilterState} from '../lib/filters';

import {
  crossFilter,
  pushCrossFilterHistory,
  popCrossFilterHistory,
  clearCrossFilterHistory,
  canUndoCrossFilter,
  type CrossFilterDimension,
} from '../lib/crossfilter';

type Scope = {
  filters: FilterState;
  update: (patch: Partial<FilterState>, options?: { replace?: boolean }) => void;
  clear: () => void;
  notice: string;
  clearNotice: () => void;
  metadata: ReturnType<typeof useMetadata>;
  applyCrossFilter: (dimension: CrossFilterDimension, value: string, isMulti?: boolean) => void;
  undoCrossFilter: () => boolean;
};
const Context = createContext<Scope | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const encoded = params.toString();
  const filters = useMemo(() => parseFilters(new URLSearchParams(encoded)), [encoded]);
  const metadata = useMetadata({ account_ids: filters.account_ids });
  const account = filters.account_ids.join('|');
  const previousAccount = useRef(account);
  const [notice, setNotice] = useState('');

  const previousPathname = useRef(location.pathname);
  const lastActiveFilters = useRef(filters);

  useEffect(() => {
    lastActiveFilters.current = filters;
  }, [filters]);

  useEffect(() => {
    if (previousPathname.current !== location.pathname) {
      previousPathname.current = location.pathname;
      if (!location.search && hasActiveFilters(lastActiveFilters.current)) {
        const carried = serializeFilters(lastActiveFilters.current, new URLSearchParams(), false);
        setParams(carried, { replace: true });
      }
    }
  }, [location.pathname, location.search, setParams]);

  function update(patch: Partial<FilterState>, options?: { replace?: boolean }) {
    const prior = new URLSearchParams(params);
    if (Object.hasOwn(patch, 'statuses')) prior.set('statuses', '');
    setParams(serializeFilters({ ...filters, ...patch }, prior, true), {
      replace: options?.replace ?? false,
    });
  }

  useEffect(() => {
    if (previousAccount.current === account || !metadata.data || metadata.isPlaceholderData) return;
    if ((metadata.data.filters_applied.account_ids ?? []).join('|') !== account) return;
    previousAccount.current = account;
    const cleaned = sanitizeAccountFilters(filters, metadata.data);
    if (cleaned.removed.length) {
      setNotice(`Removed unavailable filters: ${cleaned.removed.join(', ')}`);
      setParams(serializeFilters(cleaned.filters, new URLSearchParams(encoded), true), { replace: true });
    } else {
      setNotice('Account scope updated');
    }
  }, [account, metadata.data, metadata.isPlaceholderData, filters, encoded, setParams]);

  function applyCrossFilter(dimension: CrossFilterDimension, value: string, isMulti = false) {
    pushCrossFilterHistory(filters);
    const next = crossFilter(filters, dimension, value, isMulti);
    update(next);
  }

  function undoCrossFilter(): boolean {
    const previous = popCrossFilterHistory();
    if (previous) {
      update(previous);
      return true;
    }
    return false;
  }

  const latestUndo = useRef(undoCrossFilter);
  useEffect(() => {
    latestUndo.current = undoCrossFilter;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    function handleKeyDown(e: KeyboardEvent) {
      handleCrossFilterEscape(e, latestUndo.current, typeof document !== 'undefined' ? document : undefined);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <Context.Provider
      value={{
        filters,
        update,
        clear: () => {
          clearCrossFilterHistory();
          update({
            ...defaultFilters(),
            statuses: location.pathname === '/orders' || location.pathname === '/ledger' ? [] : ['DELIVERED'],
            account_ids: filters.account_ids,
          });
        },
        notice,
        clearNotice: () => setNotice(''),
        metadata,
        applyCrossFilter,
        undoCrossFilter,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useFilters() {
  const value = useContext(Context);
  if (!value) throw new Error('Missing filter provider');
  return value;
}

export function handleCrossFilterEscape(
  e: { key: string; defaultPrevented?: boolean; preventDefault?: () => void },
  undoFn: () => boolean,
  documentObj: { querySelector: (selector: string) => unknown } | undefined = typeof document !== 'undefined' ? document : undefined
): boolean {
  if (e.key !== 'Escape') return false;
  if (e.defaultPrevented) return false;
  if (!canUndoCrossFilter()) return false;

  const hasOpenDialog = Boolean(
    documentObj?.querySelector('[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open]')
  );
  if (hasOpenDialog) return false;

  e.preventDefault?.();
  return undoFn();
}



