import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { useFilters } from './FilterContext';
import { validateFilters } from '../lib/filters';
import { Search, Compass, Bookmark, SunMoon } from 'lucide-react';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
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
      run: () =>
        navigate({
          pathname: i === 0 ? '/' : `/${label.toLowerCase().replace(' ', '-')}`,
          search: location.search,
        }),
    })),
    {
      label: 'Apply saved preset',
      icon: Bookmark,
      run: () => {
        try {
          const raw = localStorage.getItem('food-khata-preset');
          if (raw) update(validateFilters(JSON.parse(raw)));
          else setMessage('No saved preset.');
        } catch {
          setMessage('Saved preset could not load.');
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
          setter?.call(select, document.documentElement.dataset.v2theme === 'dark' ? 'light' : 'dark');
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      },
    },
  ];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-xs hover:bg-accent hover:text-accent-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden rounded-xl border bg-card shadow-2xl">
          <div className="p-4 border-b bg-card">
            <DialogTitle className="text-base font-semibold">Commands</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              Jump to a page, apply your saved preset, or change theme.
            </DialogDescription>
            <div className="relative mt-3">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                aria-label="Search commands"
                placeholder="Search commands..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <div className="p-2 max-h-72 overflow-y-auto space-y-1">
            {actions
              .filter(x => x.label.toLowerCase().includes(search.toLowerCase()))
              .map(x => {
                const Icon = x.icon;
                return (
                  <button
                    key={x.label}
                    onClick={() => {
                      x.run();
                      setOpen(false);
                      setSearch('');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors text-left"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>{x.label}</span>
                  </button>
                );
              })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
