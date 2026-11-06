import { useEffect, useState } from 'react';
import { Sun, Moon, Laptop } from 'lucide-react';

export function ThemeControl() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('food-khata-v2-theme') ?? 'system';
    } catch {
      return 'system';
    }
  });

  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const isDark = theme === 'system' ? media.matches : theme === 'dark';
      document.documentElement.classList.toggle('dark', isDark);
      document.documentElement.dataset.v2theme = isDark ? 'dark' : 'light';
    };
    apply();
    media.addEventListener('change', apply);
    try {
      localStorage.setItem('food-khata-v2-theme', theme);
    } catch {
      /* Theme remains usable without storage. */
    }
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center justify-center text-muted-foreground">
        {theme === 'dark' ? (
          <Moon className="h-3.5 w-3.5" />
        ) : theme === 'light' ? (
          <Sun className="h-3.5 w-3.5" />
        ) : (
          <Laptop className="h-3.5 w-3.5" />
        )}
      </div>
      <select
        aria-label="Theme"
        value={theme}
        onChange={e => setTheme(e.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium shadow-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground cursor-pointer"
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </div>
  );
}
