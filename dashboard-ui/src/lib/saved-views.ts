import { userStorageKey } from './user-storage';
export const SAVED_VIEWS_KEY = 'food-khata-views';

export interface SavedView {
  id: string;
  name: string;
  createdAt: string;
  filters: Record<string, any>;
  sort?: string;
  direction?: string;
  columnVisibility?: Record<string, boolean>;
}

export interface SaveViewInput {
  id?: string;
  name: string;
  createdAt?: string;
  filters?: Record<string, any>;
  sort?: string;
  direction?: string;
  columnVisibility?: Record<string, boolean>;
}

function safeGetStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch {
    // Storage access denied (security error or private browsing)
  }
  return null;
}

function dispatchViewsChanged(): void {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('food-khata-views-changed'));
    }
  } catch {
    // Ignore in environments where CustomEvent or dispatchEvent isn't available
  }
}

export function loadSavedViews(): SavedView[] {
  try {
    const storage = safeGetStorage();
    if (!storage) return [];

    const raw = storage.getItem(userStorageKey(SAVED_VIEWS_KEY));
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is Record<string, any> => item != null && typeof item === 'object' && !Array.isArray(item))
      .filter(item => typeof item.id === 'string' && typeof item.name === 'string' && item.name.trim().length > 0)
      .map(item => ({
        id: String(item.id),
        name: String(item.name).trim(),
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
        filters:
          typeof item.filters === 'object' && item.filters !== null && !Array.isArray(item.filters)
            ? item.filters
            : {},
        sort: typeof item.sort === 'string' ? item.sort : undefined,
        direction: typeof item.direction === 'string' ? item.direction : undefined,
        columnVisibility:
          typeof item.columnVisibility === 'object' &&
          item.columnVisibility !== null &&
          !Array.isArray(item.columnVisibility)
            ? (item.columnVisibility as Record<string, boolean>)
            : undefined,
      }));
  } catch {
    return [];
  }
}

function persistViews(views: SavedView[]): void {
  try {
    const storage = safeGetStorage();
    if (!storage) return;
    storage.setItem(userStorageKey(SAVED_VIEWS_KEY), JSON.stringify(views));
    dispatchViewsChanged();
  } catch {
    // Ignore storage quota, security or permission errors
  }
}

export function saveView(
  inputOrName: string | SaveViewInput,
  filters?: Record<string, any>,
  sort?: string,
  direction?: string,
  columnVisibility?: Record<string, boolean>,
): SavedView {
  try {
    const current = loadSavedViews();
    let newView: SavedView;

    if (typeof inputOrName === 'string') {
      newView = {
        id: `view_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        name: inputOrName.trim(),
        createdAt: new Date().toISOString(),
        filters: filters ?? {},
        sort,
        direction,
        columnVisibility,
      };
    } else {
      newView = {
        id: inputOrName.id || `view_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        name: (inputOrName.name || 'Untitled view').trim(),
        createdAt: inputOrName.createdAt || new Date().toISOString(),
        filters: inputOrName.filters ?? {},
        sort: inputOrName.sort,
        direction: inputOrName.direction,
        columnVisibility: inputOrName.columnVisibility,
      };
    }

    const index = current.findIndex(v => v.id === newView.id);
    let updated: SavedView[];
    if (index >= 0) {
      updated = [...current];
      updated[index] = newView;
    } else {
      updated = [...current, newView];
    }

    persistViews(updated);
    return newView;
  } catch {
    const fallback: SavedView = {
      id: `view_${Date.now()}`,
      name: typeof inputOrName === 'string' ? inputOrName : inputOrName.name || 'Untitled view',
      createdAt: new Date().toISOString(),
      filters: typeof inputOrName === 'string' ? (filters ?? {}) : (inputOrName.filters ?? {}),
      sort: typeof inputOrName === 'string' ? sort : inputOrName.sort,
      direction: typeof inputOrName === 'string' ? direction : inputOrName.direction,
      columnVisibility: typeof inputOrName === 'string' ? columnVisibility : inputOrName.columnVisibility,
    };
    return fallback;
  }
}

export function deleteView(id: string): SavedView[] {
  try {
    const current = loadSavedViews();
    const updated = current.filter(v => v.id !== id);
    persistViews(updated);
    return updated;
  } catch {
    return [];
  }
}

export function renameView(id: string, newName: string): SavedView[] {
  try {
    const current = loadSavedViews();
    const trimmed = newName.trim();
    const updated = current.map(v => (v.id === id ? { ...v, name: trimmed || v.name } : v));
    persistViews(updated);
    return updated;
  } catch {
    return [];
  }
}
