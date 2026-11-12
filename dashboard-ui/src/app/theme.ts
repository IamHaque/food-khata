import { useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ThemeAccent = 'emerald' | 'indigo' | 'amber' | 'rose' | 'slate';

export const MODE_STORAGE_KEY = 'food-khata-mode';
export const ACCENT_STORAGE_KEY = 'food-khata-accent';
export const LEGACY_THEME_STORAGE_KEY = 'food-khata-v2-theme';

export const DEFAULT_MODE: ThemeMode = 'system';
export const DEFAULT_ACCENT: ThemeAccent = 'emerald';

export const VALID_MODES: readonly ThemeMode[] = ['light', 'dark', 'system'] as const;
export const VALID_ACCENTS: readonly ThemeAccent[] = [
  'emerald',
  'indigo',
  'amber',
  'rose',
  'slate',
] as const;

export interface ThemeState {
  mode: ThemeMode;
  accent: ThemeAccent;
  isDark: boolean;
  /** Opt-in hatch fills on charts. */
  patterns: boolean;
}

export type ThemeListener = (state: ThemeState) => void;

function isValidMode(val: unknown): val is ThemeMode {
  return val === 'light' || val === 'dark' || val === 'system';
}

function isValidAccent(val: unknown): val is ThemeAccent {
  return (
    val === 'emerald' ||
    val === 'indigo' ||
    val === 'amber' ||
    val === 'rose' ||
    val === 'slate'
  );
}

/**
 * Scenario 4: Migration.
 * If food-khata-v2-theme exists:
 * - If it contains 'dark', migrate mode to 'dark'; else 'light'.
 * - Remove food-khata-v2-theme.
 * - Save to food-khata-mode.
 */
export function migrateLegacyTheme(): ThemeMode | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const legacy = localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    if (legacy !== null) {
      const migrated: ThemeMode = legacy.includes('dark') ? 'dark' : 'light';
      localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
      localStorage.setItem(MODE_STORAGE_KEY, migrated);
      return migrated;
    }
  } catch {
    /* storage access error */
  }
  return null;
}

export function getStoredMode(): ThemeMode {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_MODE;
    migrateLegacyTheme();
    const stored = localStorage.getItem(MODE_STORAGE_KEY);
    if (isValidMode(stored)) return stored;
  } catch {
    /* storage access error */
  }
  return DEFAULT_MODE;
}

export function getStoredAccent(): ThemeAccent {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_ACCENT;
    const stored = localStorage.getItem(ACCENT_STORAGE_KEY);
    if (isValidAccent(stored)) return stored;
  } catch {
    /* storage access error */
  }
  return DEFAULT_ACCENT;
}

export function getSystemDark(): boolean {
  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
  } catch {
    /* window or matchMedia unavailable */
  }
  return false;
}

export function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return getSystemDark();
}

/**
 * Applies the given mode and accent to the DOM.
 */
export function applyThemeToDOM(mode: ThemeMode, accent: ThemeAccent): boolean {
  const isDark = resolveIsDark(mode);
  if (typeof document !== 'undefined' && document.documentElement) {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.setAttribute('data-accent', accent);
    if (root.dataset) {
      root.dataset.v2theme = isDark ? 'dark' : 'light';
    }
  }
  return isDark;
}

// Module singleton state
let activeMode: ThemeMode = typeof localStorage !== 'undefined' ? getStoredMode() : DEFAULT_MODE;
let activeAccent: ThemeAccent = typeof localStorage !== 'undefined' ? getStoredAccent() : DEFAULT_ACCENT;
const listeners = new Set<ThemeListener>();
let activeCleanup: (() => void) | null = null;

function notify(): void {
  const state: ThemeState = {
    mode: activeMode,
    accent: activeAccent,
    isDark: resolveIsDark(activeMode),
    patterns: getPatterns(),
  };
  for (const listener of listeners) {
    try {
      listener(state);
    } catch {
      /* ignore listener error */
    }
  }
}

// Opt-in "Accessible patterns": hatch fills on chart marks, off by default.
export const PATTERNS_STORAGE_KEY = 'food-khata-patterns';
export function getPatterns(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(PATTERNS_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}
export function setPatterns(on: boolean): void {
  try {
    localStorage.setItem(PATTERNS_STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* storage access error */
  }
  notify();
}

export function getThemeState(): ThemeState {
  return {
    mode: activeMode,
    accent: activeAccent,
    isDark: resolveIsDark(activeMode),
    patterns: getPatterns(),
  };
}

export function subscribeTheme(listener: ThemeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setMode(newMode: ThemeMode): void {
  activeMode = newMode;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MODE_STORAGE_KEY, newMode);
    }
  } catch {
    /* storage access error */
  }
  applyThemeToDOM(activeMode, activeAccent);
  notify();
}

export function setAccent(newAccent: ThemeAccent): void {
  activeAccent = newAccent;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ACCENT_STORAGE_KEY, newAccent);
    }
  } catch {
    /* storage access error */
  }
  applyThemeToDOM(activeMode, activeAccent);
  notify();
}

/**
 * Initializes the theme engine:
 * 1. Runs migration if legacy theme key is present
 * 2. Reads stored mode and accent
 * 3. Applies them to document.documentElement
 * 4. Attaches window.matchMedia listener for dynamic OS changes in system mode
 */
export function initTheme(): () => void {
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }

  migrateLegacyTheme();
  activeMode = getStoredMode();
  activeAccent = getStoredAccent();
  applyThemeToDOM(activeMode, activeAccent);

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = () => {
      if (activeMode === 'system') {
        applyThemeToDOM(activeMode, activeAccent);
        notify();
      }
    };

    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handleMediaChange);
      activeCleanup = () => mq.removeEventListener('change', handleMediaChange);
    } else if (typeof mq.addListener === 'function') {
      mq.addListener(handleMediaChange);
      activeCleanup = () => mq.removeListener(handleMediaChange);
    }
  }

  return () => {
    if (activeCleanup) {
      activeCleanup();
      activeCleanup = null;
    }
  };
}

export function useTheme(): {
  mode: ThemeMode;
  accent: ThemeAccent;
  isDark: boolean;
  patterns: boolean;
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: ThemeAccent) => void;
} {
  const [state, setState] = useState<ThemeState>(() => getThemeState());

  useEffect(() => {
    setState(getThemeState());
    return subscribeTheme((next) => {
      setState(next);
    });
  }, []);

  return {
    mode: state.mode,
    accent: state.accent,
    isDark: state.isDark,
    patterns: state.patterns,
    setMode,
    setAccent,
  };
}