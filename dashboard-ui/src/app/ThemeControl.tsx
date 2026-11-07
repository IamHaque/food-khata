import { useEffect, useRef, useState } from 'react';
import { Sun, Moon, Laptop, Check } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover';
import { SegmentedControl } from '../components/ui/segmented-control';
import { useTheme } from './theme';
import type { ThemeMode, ThemeAccent } from './theme';

const MODE_OPTIONS = [
  { value: 'light', label: 'Light', icon: <Sun className="h-3.5 w-3.5" /> },
  { value: 'dark', label: 'Dark', icon: <Moon className="h-3.5 w-3.5" /> },
  { value: 'system', label: 'System', icon: <Laptop className="h-3.5 w-3.5" /> },
];

const ACCENTS: { value: ThemeAccent; label: string; color: string }[] = [
  { value: 'emerald', label: 'Emerald', color: '#05623d' },
  { value: 'indigo', label: 'Indigo', color: '#3730a3' },
  { value: 'amber', label: 'Amber', color: '#92400e' },
  { value: 'rose', label: 'Rose', color: '#9f1239' },
  { value: 'slate', label: 'Slate', color: '#334155' },
];

export function ThemeControl() {
  const { mode, accent, setMode, setAccent } = useTheme();
  const committedAccentRef = useRef<ThemeAccent>(accent);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    committedAccentRef.current = accent;
  }, [accent]);

  const previewAccent = (a: ThemeAccent) => {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('data-accent', a);
    }
  };

  const revertAccent = () => {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('data-accent', committedAccentRef.current);
    }
  };

  const commitAccent = (a: ThemeAccent) => {
    committedAccentRef.current = a;
    setAccent(a);
  };

  const triggerIcon =
    mode === 'dark' ? <Moon className="h-4 w-4" /> : mode === 'light' ? <Sun className="h-4 w-4" /> : <Laptop className="h-4 w-4" />;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Appearance"
          className="inline-flex items-center justify-center p-2 rounded-md border border-input bg-background min-h-[44px] min-w-[44px] text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
        >
          {triggerIcon}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <h2 className="text-sm font-semibold text-foreground mb-3">Appearance</h2>

        <section className="mb-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">Mode</p>
          <SegmentedControl
            options={MODE_OPTIONS}
            value={mode}
            onChange={(v) => setMode(v as ThemeMode)}
          />
        </section>

        <section>
          <p className="text-xs font-medium text-muted-foreground mb-2">Accent</p>
          <div className="grid grid-cols-1 gap-1.5">
            {ACCENTS.map((a) => {
              const active = a.value === accent;
              return (
                <button
                  key={a.value}
                  type="button"
                  aria-label={a.label}
                  aria-pressed={active}
                  onClick={() => commitAccent(a.value)}
                  onMouseEnter={() => previewAccent(a.value)}
                  onMouseLeave={revertAccent}
                  onFocus={() => previewAccent(a.value)}
                  onBlur={revertAccent}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      commitAccent(a.value);
                    }
                  }}
                  className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    active ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <span
                    className="inline-block h-4 w-4 rounded-full ring-1 ring-border"
                    style={{ backgroundColor: a.color }}
                  />
                  <span className="flex-1 text-left">{a.label}</span>
                  {active && <Check className="h-3.5 w-3.5" />}
                </button>
              );
            })}
          </div>
        </section>
      </PopoverContent>
    </Popover>
  );
}