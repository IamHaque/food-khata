import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  initTheme,
  setMode,
  setAccent,
  migrateLegacyTheme,
  applyThemeToDOM,
  MODE_STORAGE_KEY,
  ACCENT_STORAGE_KEY,
  LEGACY_THEME_STORAGE_KEY,
} from './theme';

describe('theme engine (S-003)', () => {
  let store: Record<string, string> = {};
  let rootClasses: Set<string>;
  let rootAttributes: Map<string, string>;
  let mediaChangeHandlers: Array<(e: { matches: boolean }) => void>;
  let systemPrefersDark: boolean;

  beforeEach(() => {
    store = {};
    rootClasses = new Set<string>();
    rootAttributes = new Map<string, string>();
    mediaChangeHandlers = [];
    systemPrefersDark = false;

    const mockStorage = {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: (key: string, val: string) => {
        store[key] = String(val);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };

    const mockElement = {
      classList: {
        add: (cls: string) => rootClasses.add(cls),
        remove: (cls: string) => rootClasses.delete(cls),
        contains: (cls: string) => rootClasses.has(cls),
        toggle: (cls: string, force?: boolean) => {
          if (force !== undefined) {
            if (force) rootClasses.add(cls);
            else rootClasses.delete(cls);
            return force;
          }
          if (rootClasses.has(cls)) {
            rootClasses.delete(cls);
            return false;
          }
          rootClasses.add(cls);
          return true;
        },
      },
      setAttribute: (name: string, val: string) => rootAttributes.set(name, String(val)),
      getAttribute: (name: string) => rootAttributes.get(name) ?? null,
      dataset: {} as Record<string, string>,
    };

    const mockMatchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: systemPrefersDark,
      media: query,
      onchange: null,
      addEventListener: (_event: string, handler: (e: { matches: boolean }) => void) => {
        mediaChangeHandlers.push(handler);
      },
      removeEventListener: (_event: string, handler: (e: { matches: boolean }) => void) => {
        const idx = mediaChangeHandlers.indexOf(handler);
        if (idx !== -1) mediaChangeHandlers.splice(idx, 1);
      },
      addListener: (handler: (e: { matches: boolean }) => void) => {
        mediaChangeHandlers.push(handler);
      },
      removeListener: (handler: (e: { matches: boolean }) => void) => {
        const idx = mediaChangeHandlers.indexOf(handler);
        if (idx !== -1) mediaChangeHandlers.splice(idx, 1);
      },
      dispatchEvent: vi.fn(),
    }));

    vi.stubGlobal('localStorage', mockStorage);
    vi.stubGlobal('document', { documentElement: mockElement });
    vi.stubGlobal('window', { matchMedia: mockMatchMedia });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Scenario 1: Mode and accent are independent', () => {
    it('sets class "dark" and data-accent="indigo" when accent is indigo and mode is dark', () => {
      initTheme();
      setAccent('indigo');
      setMode('dark');

      expect(rootClasses.has('dark')).toBe(true);
      expect(rootAttributes.get('data-accent')).toBe('indigo');
      expect(store[MODE_STORAGE_KEY]).toBe('dark');
      expect(store[ACCENT_STORAGE_KEY]).toBe('indigo');
    });

    it('changing mode preserves the selected accent', () => {
      initTheme();
      setAccent('rose');
      setMode('dark');
      expect(rootAttributes.get('data-accent')).toBe('rose');

      setMode('light');
      expect(rootClasses.has('dark')).toBe(false);
      expect(rootAttributes.get('data-accent')).toBe('rose');
      expect(store[ACCENT_STORAGE_KEY]).toBe('rose');
    });

    it('changing accent preserves the selected mode', () => {
      initTheme();
      setMode('dark');
      setAccent('amber');
      expect(rootClasses.has('dark')).toBe(true);
      expect(rootAttributes.get('data-accent')).toBe('amber');

      setAccent('slate');
      expect(rootClasses.has('dark')).toBe(true);
      expect(rootAttributes.get('data-accent')).toBe('slate');
      expect(store[MODE_STORAGE_KEY]).toBe('dark');
    });
  });

  describe('Scenario 2: System mode follows the OS', () => {
    it('dynamically adds/removes .dark class when OS theme changes in system mode without reload', () => {
      systemPrefersDark = false;
      initTheme();
      setMode('system');
      expect(rootClasses.has('dark')).toBe(false);

      // OS switches to dark
      systemPrefersDark = true;
      for (const handler of mediaChangeHandlers) {
        handler({ matches: true });
      }
      expect(rootClasses.has('dark')).toBe(true);

      // OS switches to light
      systemPrefersDark = false;
      for (const handler of mediaChangeHandlers) {
        handler({ matches: false });
      }
      expect(rootClasses.has('dark')).toBe(false);
    });

    it('does not follow OS changes if explicit mode (dark/light) is set', () => {
      systemPrefersDark = false;
      initTheme();
      setMode('light');
      expect(rootClasses.has('dark')).toBe(false);

      // OS switches to dark, but mode is light
      systemPrefersDark = true;
      for (const handler of mediaChangeHandlers) {
        handler({ matches: true });
      }
      expect(rootClasses.has('dark')).toBe(false);
    });
  });

  describe('Scenario 4: Migration', () => {
    it('migrates dark theme from legacy key to food-khata-mode and removes legacy key', () => {
      store[LEGACY_THEME_STORAGE_KEY] = 'dark';
      const migrated = migrateLegacyTheme();
      expect(migrated).toBe('dark');
      expect(store[MODE_STORAGE_KEY]).toBe('dark');
      expect(store[LEGACY_THEME_STORAGE_KEY]).toBeUndefined();
    });

    it('migrates non-dark theme from legacy key to light mode and removes legacy key', () => {
      store[LEGACY_THEME_STORAGE_KEY] = 'food-khata-light';
      const migrated = migrateLegacyTheme();
      expect(migrated).toBe('light');
      expect(store[MODE_STORAGE_KEY]).toBe('light');
      expect(store[LEGACY_THEME_STORAGE_KEY]).toBeUndefined();
    });

    it('returns null if legacy key does not exist', () => {
      const migrated = migrateLegacyTheme();
      expect(migrated).toBeNull();
    });
  });

  describe('applyThemeToDOM helper', () => {
    it('applies dark class and data-accent', () => {
      applyThemeToDOM('dark', 'amber');
      expect(rootClasses.has('dark')).toBe(true);
      expect(rootAttributes.get('data-accent')).toBe('amber');
    });

    it('removes dark class for light mode and sets accent', () => {
      rootClasses.add('dark');
      applyThemeToDOM('light', 'slate');
      expect(rootClasses.has('dark')).toBe(false);
      expect(rootAttributes.get('data-accent')).toBe('slate');
    });
  });
});