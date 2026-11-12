import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { useFilters } from './FilterContext';
import { calculatePresetDates, defaultFilters, serializeFilters } from '../lib/filters';
import { loadSavedViews, saveView, type SavedView } from '../lib/saved-views';
import { saveTablePrefs } from '../lib/table-prefs';
import { useTheme } from './theme';
import type { ThemeMode, ThemeAccent } from './theme';
import {
  Search,
  Compass,
  Bookmark,
  SunMoon,
  Palette,
  Filter,
  Receipt,
} from 'lucide-react';

type Group = 'Navigate' | 'Filters' | 'Appearance' | 'Orders' | 'Saved views';

interface Command {
  group: Group;
  label: string;
  keywords?: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}

const MODES: ThemeMode[] = ['light', 'dark', 'system'];
const ACCENTS: ThemeAccent[] = ['emerald', 'indigo', 'amber', 'rose', 'slate'];
const PLATFORMS = ['SWIGGY', 'ZOMATO'];

export interface CommandPaletteProps {
  initialOpen?: boolean;
}

export function activateSavedView(
  view: SavedView,
  context: {
    update: (patch: Record<string, any>) => void;
    navigate: (to: { pathname: string; search: string }) => void;
    currentSearch?: string;
    savePrefs?: typeof saveTablePrefs;
  },
) {
  context.update(view.filters);

  if (view.columnVisibility) {
    (context.savePrefs ?? saveTablePrefs)({ columnVisibility: view.columnVisibility });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('food-khata-prefs-changed'));
    }
  }

  const targetParams = serializeFilters(
    { ...defaultFilters(), ...view.filters },
    new URLSearchParams(context.currentSearch ?? ''),
    true,
  );
  if (view.sort) targetParams.set('sort', view.sort);
  if (view.direction) targetParams.set('direction', view.direction);
  targetParams.set('page', '1');

  context.navigate({ pathname: '/orders', search: targetParams.toString() });
}

export function saveCurrentViewFromPalette(
  state: {
    filters: Record<string, any>;
    search?: string;
  },
  saveFn: typeof saveView = saveView,
): SavedView {
  const views = loadSavedViews();
  const name = `View ${views.length + 1}`;
  const params = new URLSearchParams(state.search ?? '');
  const sort = params.get('sort') ?? undefined;
  const direction = params.get('direction') ?? undefined;
  return saveFn({ name, filters: state.filters, sort, direction });
}

export function CommandPalette({ initialOpen = false }: CommandPaletteProps = {}) {
  const [open, setOpen] = useState(initialOpen);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [message, setMessage] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { filters, update } = useFilters();
  const { mode, setMode, setAccent } = useTheme();
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => loadSavedViews());

  useEffect(() => {
    if (open) {
      setSavedViews(loadSavedViews());
    }
  }, [open]);

  useEffect(() => {
    const handleViewsSync = () => {
      setSavedViews(loadSavedViews());
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleViewsSync);
      window.addEventListener('food-khata-views-changed', handleViewsSync);
      return () => {
        window.removeEventListener('storage', handleViewsSync);
        window.removeEventListener('food-khata-views-changed', handleViewsSync);
      };
    }
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    let gPending = false;
    let gTimer: ReturnType<typeof setTimeout> | null = null;
    const clearG = () => {
      gPending = false;
      if (gTimer) {
        clearTimeout(gTimer);
        gTimer = null;
      }
    };

    const isTyping = (target: EventTarget | null) => {
      if (!target || !(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
    };

    const cycleMode = () => {
      const idx = MODES.indexOf(mode);
      const next = MODES[(idx + 1) % MODES.length];
      setMode(next);
      setAnnouncement(`Switched mode to ${next}`);
    };

    const onKey = (e: KeyboardEvent) => {
      // Ctrl/Cmd+K toggles palette (always)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(x => !x);
        return;
      }

      // Single/sequential shortcuts disabled while typing
      if (isTyping(e.target)) return;

      // Two-key sequence: g then o/s/f/h/d
      if (gPending) {
        clearG();
        const map: Record<string, string> = {
          o: '/',
          s: '/spending',
          f: '/food',
          h: '/habits',
          d: '/orders',
        };
        const path = map[e.key.toLowerCase()];
        if (path) {
          e.preventDefault();
          navigate({ pathname: path, search: location.search });
          setAnnouncement(`Navigated to ${path === '/' ? 'Overview' : path.slice(1)}`);
        }
        return;
      }

      if (e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        gPending = true;
        gTimer = setTimeout(clearG, 1200);
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        setOpen(true);
        setShowHelp(false);
        return;
      }

      if (e.key.toLowerCase() === 't' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        cycleMode();
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        setOpen(true);
        setShowHelp(true);
        return;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearG();
    };
  }, [location.search, mode, navigate, setMode]);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  const go = (path: string, label: string) => {
    navigate({ pathname: path, search: location.search });
    setAnnouncement(`Navigated to ${label}`);
  };

  const togglePlatform = (platform: string) => {
    const has = filters.platforms.includes(platform);
    const next = has
      ? filters.platforms.filter(p => p !== platform)
      : [...filters.platforms, platform];
    update({ platforms: next });
    setAnnouncement(`${has ? 'Removed' : 'Added'} platform ${platform}`);
  };

  const applyPreset = (preset: string) => {
    const { date_from, date_to } = calculatePresetDates(preset);
    update({ date_from, date_to });
    setAnnouncement(`Applied ${preset} period`);
  };

  const commands: Command[] = [
    // Navigate
    { group: 'Navigate', label: 'Overview', icon: Compass, run: () => go('/', 'Overview') },
    { group: 'Navigate', label: 'Spending', icon: Compass, run: () => go('/spending', 'Spending') },
    { group: 'Navigate', label: 'Food', icon: Compass, run: () => go('/food', 'Food') },
    { group: 'Navigate', label: 'Habits', icon: Compass, run: () => go('/habits', 'Habits') },
    { group: 'Navigate', label: 'Places', icon: Compass, run: () => go('/places', 'Places') },
    { group: 'Navigate', label: 'Orders', icon: Compass, run: () => go('/orders', 'Orders') },
    { group: 'Navigate', label: 'Data health', icon: Compass, run: () => go('/data-health', 'Data health') },
    { group: 'Navigate', label: 'Sync jobs', icon: Compass, run: () => { navigate({ pathname: '/jobs', search: '' }); setAnnouncement('Navigated to Sync jobs'); } },
    { group: 'Navigate', label: 'Settings', icon: Compass, run: () => { navigate({ pathname: '/settings', search: '' }); setAnnouncement('Navigated to Settings'); } },
    // Filters
    { group: 'Filters', label: 'Period: 7d', icon: Filter, run: () => applyPreset('7d') },
    { group: 'Filters', label: 'Period: 30d', icon: Filter, run: () => applyPreset('30d') },
    { group: 'Filters', label: 'Period: 90d', icon: Filter, run: () => applyPreset('90d') },
    { group: 'Filters', label: 'Period: all-time', icon: Filter, run: () => applyPreset('all') },
    ...PLATFORMS.map(p => ({
      group: 'Filters' as Group,
      label: `Toggle platform: ${p}`,
      icon: Filter,
      run: () => togglePlatform(p),
    })),
    // Appearance
    ...MODES.map(m => ({
      group: 'Appearance' as Group,
      label: `Switch mode: ${m}`,
      icon: SunMoon,
      run: () => {
        setMode(m);
        setAnnouncement(`Switched mode to ${m}`);
      },
    })),
    ...ACCENTS.map(a => ({
      group: 'Appearance' as Group,
      label: `Switch accent: ${a}`,
      icon: Palette,
      run: () => {
        setAccent(a);
        setAnnouncement(`Switched accent to ${a}`);
      },
    })),
    // Orders
    {
      group: 'Orders',
      label: 'Find order by restaurant or item',
      icon: Receipt,
      run: () => {
        navigate({ pathname: '/orders', search: location.search });
        setAnnouncement('Opened orders');
      },
    },
    // Saved views
    {
      group: 'Saved views',
      label: 'Save current view',
      keywords: 'save view bookmark',
      icon: Bookmark,
      run: () => {
        try {
          const saved = saveCurrentViewFromPalette({ filters, search: location.search });
          setSavedViews(loadSavedViews());
          setMessage(`Saved view "${saved.name}".`);
          setAnnouncement('Saved current view.');
        } catch {
          setMessage('Could not save view.');
        }
      },
    },
    ...savedViews.map(view => ({
      group: 'Saved views' as Group,
      label: view.name,
      keywords: `saved view ${view.name}`,
      icon: Bookmark,
      run: () => {
        activateSavedView(view, {
          update,
          navigate,
          currentSearch: location.search,
          savePrefs: saveTablePrefs,
        });
        setAnnouncement(`Applied view ${view.name}`);
      },
    })),
  ];

  const filtered = commands.filter(c => {
    const q = query.toLowerCase();
    if (!q) return true;
    return (c.label + ' ' + (c.keywords ?? '') + ' ' + c.group).toLowerCase().includes(q);
  });

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const runAction = (index: number) => {
    const target = filtered[index];
    if (target) {
      target.run();
      setOpen(false);
      setQuery('');
      setShowHelp(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => (filtered.length ? (i + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runAction(selectedIndex);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // Group filtered commands preserving group order
  const groupOrder: Group[] = ['Navigate', 'Filters', 'Appearance', 'Orders', 'Saved views'];
  const groups = groupOrder
    .map(g => ({ group: g, items: filtered.filter(c => c.group === g) }))
    .filter(g => g.items.length > 0);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 min-h-[36px] text-xs font-medium text-muted-foreground shadow-xs hover:bg-accent hover:text-accent-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span>Commands</span>
        <kbd className="pointer-events-none inline-flex h-4 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-xs font-medium text-muted-foreground">
          Ctrl K
        </kbd>
      </button>

      {message && (
        <span role="status" className="text-xs text-muted-foreground">
          {message}
        </span>
      )}

      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-md p-0 overflow-hidden rounded-xl border bg-card shadow-2xl"
          onCloseAutoFocus={event => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <div className="p-4 border-b bg-card">
            <DialogTitle className="text-base font-semibold">Command palette</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              {showHelp
                ? 'Keyboard shortcuts: g then o/s/f/h/d to navigate, / search, t cycle mode, ? help, Ctrl/Cmd+K toggle.'
                : 'Jump to a page, apply filters, change appearance, find orders, or manage saved views.'}
            </DialogDescription>
            <div className="relative mt-3">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                ref={inputRef}
                aria-label="Search commands"
                placeholder="Search commands..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
              />
            </div>
          </div>

          <div className="p-2 max-h-72 overflow-y-auto space-y-2" aria-label="Command suggestions">
            {filtered.length === 0 ? (
              <p role="status" className="p-4 text-center text-xs text-muted-foreground">
                No matching commands found.
              </p>
            ) : (
              groups.map(g => (
                <section key={g.group} aria-label={g.group}>
                  <h3 className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.group}
                  </h3>
                  <div className="space-y-1">
                    {g.items.map(c => {
                      const idx = filtered.indexOf(c);
                      const Icon = c.icon;
                      const isSelected = idx === selectedIndex;
                      return (
                        <button
                          key={c.label + c.group}
                          type="button"
                          data-selected={isSelected}
                          onClick={() => runAction(idx)}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                            isSelected
                              ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                              : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                          }`}
                        >
                          <Icon className={`h-4 w-4 shrink-0 ${isSelected ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                          <span>{c.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))
            )}
          </div>

          {showHelp && (
            <div className="p-3 border-t text-xs text-muted-foreground space-y-1" role="note">
              <p><kbd>g</kbd> then <kbd>o</kbd>/<kbd>s</kbd>/<kbd>f</kbd>/<kbd>h</kbd>/<kbd>d</kbd>: navigate</p>
              <p><kbd>/</kbd>: search · <kbd>t</kbd>: cycle mode · <kbd>?</kbd>: help · <kbd>Ctrl/Cmd+K</kbd>: toggle</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
