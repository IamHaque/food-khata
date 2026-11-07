export type TableDensity = 'comfortable' | 'compact';

export interface TablePrefs {
  columnVisibility?: Record<string, boolean>;
  density?: TableDensity;
  pageSize?: number;
}

export const TABLE_PREFS_KEY = 'food-khata-table-prefs';

export const DEFAULT_TABLE_PREFS: Required<TablePrefs> = {
  density: 'comfortable',
  pageSize: 50,
  columnVisibility: {},
};

export const ALLOWED_PAGE_SIZES = [25, 50, 100, 200] as const;

export function loadTablePrefs(): Required<TablePrefs> {
  try {
    if (typeof localStorage === 'undefined') {
      return { ...DEFAULT_TABLE_PREFS };
    }
    const raw = localStorage.getItem(TABLE_PREFS_KEY);
    if (!raw) {
      return { ...DEFAULT_TABLE_PREFS };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_TABLE_PREFS };
    }

    const density: TableDensity =
      parsed.density === 'compact' || parsed.density === 'comfortable'
        ? parsed.density
        : DEFAULT_TABLE_PREFS.density;

    const pageSize =
      typeof parsed.pageSize === 'number' && (ALLOWED_PAGE_SIZES as readonly number[]).includes(parsed.pageSize)
        ? parsed.pageSize
        : DEFAULT_TABLE_PREFS.pageSize;

    const columnVisibility =
      parsed.columnVisibility &&
      typeof parsed.columnVisibility === 'object' &&
      !Array.isArray(parsed.columnVisibility)
        ? (parsed.columnVisibility as Record<string, boolean>)
        : { ...DEFAULT_TABLE_PREFS.columnVisibility };

    return {
      density,
      pageSize,
      columnVisibility,
    };
  } catch {
    return { ...DEFAULT_TABLE_PREFS };
  }
}

export function saveTablePrefs(prefs: Partial<TablePrefs>): void {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }
    const current = loadTablePrefs();
    const updated: Required<TablePrefs> = {
      density: prefs.density ?? current.density,
      pageSize: prefs.pageSize ?? current.pageSize,
      columnVisibility: prefs.columnVisibility ?? current.columnVisibility,
    };
    localStorage.setItem(TABLE_PREFS_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors (quota, permissions, private browsing)
  }
}
