import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  loadTablePrefs,
  saveTablePrefs,
  TABLE_PREFS_KEY,
  DEFAULT_TABLE_PREFS,
} from './table-prefs';

describe('table-prefs (S-075)', () => {
  let mockStore: Record<string, string> = {};

  beforeEach(() => {
    mockStore = {};
    const ls = {
      getItem: vi.fn((k: string) => (k in mockStore ? mockStore[k] : null)),
      setItem: vi.fn((k: string, v: string) => {
        mockStore[k] = String(v);
      }),
      removeItem: vi.fn((k: string) => {
        delete mockStore[k];
      }),
      clear: vi.fn(() => {
        mockStore = {};
      }),
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: ls,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns default preferences when storage is empty', () => {
    const prefs = loadTablePrefs();
    expect(prefs).toEqual(DEFAULT_TABLE_PREFS);
    expect(prefs.density).toBe('comfortable');
    expect(prefs.pageSize).toBe(50);
    expect(prefs.columnVisibility).toEqual({});
  });

  it('saves preferences to food-khata-table-prefs key in localStorage', () => {
    saveTablePrefs({
      density: 'compact',
      pageSize: 100,
      columnVisibility: { items_summary: false },
    });

    expect(mockStore[TABLE_PREFS_KEY]).toBeDefined();
    const parsed = JSON.parse(mockStore[TABLE_PREFS_KEY]);
    expect(parsed).toEqual({
      density: 'compact',
      pageSize: 100,
      columnVisibility: { items_summary: false },
    });
  });

  it('loads saved preferences accurately', () => {
    mockStore[TABLE_PREFS_KEY] = JSON.stringify({
      density: 'compact',
      pageSize: 200,
      columnVisibility: { status: false, platform: true },
    });

    const prefs = loadTablePrefs();
    expect(prefs.density).toBe('compact');
    expect(prefs.pageSize).toBe(200);
    expect(prefs.columnVisibility).toEqual({ status: false, platform: true });
  });

  it('merges partial preference saves without losing existing preferences', () => {
    saveTablePrefs({
      density: 'compact',
      pageSize: 100,
      columnVisibility: { delivery_fee: false },
    });

    // Update only density
    saveTablePrefs({ density: 'comfortable' });

    const prefs = loadTablePrefs();
    expect(prefs.density).toBe('comfortable');
    expect(prefs.pageSize).toBe(100);
    expect(prefs.columnVisibility).toEqual({ delivery_fee: false });

    // Update only pageSize
    saveTablePrefs({ pageSize: 25 });
    const prefs2 = loadTablePrefs();
    expect(prefs2.pageSize).toBe(25);
    expect(prefs2.density).toBe('comfortable');
    expect(prefs2.columnVisibility).toEqual({ delivery_fee: false });
  });

  it('handles corrupt JSON in localStorage gracefully without throwing', () => {
    mockStore[TABLE_PREFS_KEY] = '{not-valid-json:broken';

    expect(() => loadTablePrefs()).not.toThrow();
    const prefs = loadTablePrefs();
    expect(prefs).toEqual(DEFAULT_TABLE_PREFS);
  });

  it('handles non-object and array values in localStorage gracefully', () => {
    mockStore[TABLE_PREFS_KEY] = JSON.stringify('a plain string');
    expect(loadTablePrefs()).toEqual(DEFAULT_TABLE_PREFS);

    mockStore[TABLE_PREFS_KEY] = JSON.stringify(12345);
    expect(loadTablePrefs()).toEqual(DEFAULT_TABLE_PREFS);

    mockStore[TABLE_PREFS_KEY] = JSON.stringify([1, 2, 3]);
    expect(loadTablePrefs()).toEqual(DEFAULT_TABLE_PREFS);
  });

  it('validates density and falls back to default if invalid', () => {
    mockStore[TABLE_PREFS_KEY] = JSON.stringify({ density: 'ultra-wide' });
    const prefs = loadTablePrefs();
    expect(prefs.density).toBe('comfortable');
  });

  it('validates pageSize and falls back to default if invalid or unsupported', () => {
    mockStore[TABLE_PREFS_KEY] = JSON.stringify({ pageSize: 999 });
    const prefs = loadTablePrefs();
    expect(prefs.pageSize).toBe(50);
  });

  it('validates columnVisibility and falls back to empty object if not an object', () => {
    mockStore[TABLE_PREFS_KEY] = JSON.stringify({ columnVisibility: 'bad' });
    const prefs = loadTablePrefs();
    expect(prefs.columnVisibility).toEqual({});
  });

  it('handles localStorage throwing errors when reading gracefully', () => {
    vi.mocked(localStorage.getItem).mockImplementationOnce(() => {
      throw new Error('Access denied by security policy');
    });

    expect(() => loadTablePrefs()).not.toThrow();
    expect(loadTablePrefs()).toEqual(DEFAULT_TABLE_PREFS);
  });

  it('handles localStorage throwing errors when saving gracefully', () => {
    vi.mocked(localStorage.setItem).mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => saveTablePrefs({ density: 'compact' })).not.toThrow();
  });
});
