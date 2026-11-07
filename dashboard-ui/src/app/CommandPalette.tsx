import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { useFilters } from './FilterContext';
import { validateFilters } from '../lib/filters';
import { Search, Compass, Bookmark, SunMoon } from 'lucide-react';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [message, setMessage] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { update } = useFilters();

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(x => !x);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const actions = [
    ...['Overview', 'Spending', 'Food', 'Behavior', 'Places', 'Ledger', 'Data health'].map((label, i) => ({
      label: `Go to ${label}`,
      icon: Compass,
      run: () => {
        const path = i === 0 ? '/' : `/${label.toLowerCase().replace(' ', '-')}`;
        navigate({
          pathname: path,
          search: location.search,
        });
        setAnnouncement(`Navigated to ${label}`);
      },
    })),
    {
      label: 'Apply saved preset',
      icon: Bookmark,
      run: () => {
        try {
          const raw = localStorage.getItem('food-khata-preset');
          if (raw) {
            update(validateFilters(JSON.parse(raw)));
            setAnnouncement('Applied saved filter preset.');
          } else {
            setMessage('No saved preset.');
            setAnnouncement('No saved preset found.');
          }
        } catch {
          setMessage('Saved preset could not load.');
          setAnnouncement('Saved preset could not load.');
        }
      },
    },
    {
      label: 'Toggle theme',
      icon: SunMoon,
      run: () => {
        const select = document.querySelector<HTMLSelectElement>('select[aria-label="Theme"]');
        if (select) {
          const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
          const next = document.documentElement.dataset.v2theme === 'dark' ? 'light' : 'dark';
          setter?.call(select, next);
          select.dispatchEvent(new Event('change', { bubbles: true }));
          setAnnouncement(`Switched theme to ${next}`);
        }
      },
    },
  ];

  const filtered = actions.filter(x => x.label.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  const runAction = (index: number) => {
    const target = filtered[index];
    if (target) {
      target.run();
      setOpen(false);
      setSearch('');
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
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 min-h-[36px] text-xs font-medium text-muted-foreground shadow-xs hover:bg-accent hover:text-accent-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span>Commands</span>
        <kbd className="pointer-events-none inline-flex h-4 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          Ctrl K
        </kbd>
      </button>

      {message && (
        <span role="status" className="text-xs text-muted-foreground">
          {message}
        </span>
      )}

      {/* Screen reader live announcement for navigation & commands */}
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
            <DialogTitle className="text-base font-semibold">Commands</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              Jump to a page, apply your saved preset, or change theme. Use arrow keys and Enter to execute.
            </DialogDescription>
            <div className="relative mt-3">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                ref={inputRef}
                aria-label="Search commands"
                placeholder="Search commands..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
              />
            </div>
          </div>

          <div
            className="p-2 max-h-72 overflow-y-auto space-y-1"
            aria-label="Command suggestions"
          >
            {filtered.length === 0 ? (
              <p role="status" className="p-4 text-center text-xs text-muted-foreground">
                No matching commands found.
              </p>
            ) : (
              filtered.map((x, index) => {
                const Icon = x.icon;
                const isSelected = index === selectedIndex;
                return (
                  <button
                    key={x.label}
                    type="button"
                    data-selected={isSelected}
                    onClick={() => runAction(index)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                      isSelected
                        ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                        : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${isSelected ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                    <span>{x.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
