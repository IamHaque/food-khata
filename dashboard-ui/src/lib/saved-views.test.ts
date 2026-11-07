import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  SAVED_VIEWS_KEY,
  loadSavedViews,
  saveView,
  deleteView,
  renameView,
  type SavedView,
} from './saved-views';

describe('saved-views lib (S-073)', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const ls = {
      getItem: vi.fn((k: string) => (k in mockStorage ? mockStorage[k] : null)),
      setItem: vi.fn((k: string, v: string) => {
        mockStorage[k] = String(v);
      }),
      removeItem: vi.fn((k: string) => {
        delete mockStorage[k];
      }),
      clear: vi.fn(() => {
        mockStorage = {};
      }),
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: ls,
      writable: true,
      configurable: true,
    });
  });

  describe('Scenario: Save and Load', () => {
    it('returns empty array when nothing is stored', () => {
      expect(loadSavedViews()).toEqual([]);
    });

    it('saves a view to localStorage with unique id, createdAt and provided options', () => {
      const view = saveView({
        name: 'My Swiggy View',
        filters: { platforms: ['SWIGGY'], search: 'pizza' },
        sort: 'amount',
        direction: 'asc',
        columnVisibility: { items: false },
      });

      expect(view.id).toBeDefined();
      expect(view.name).toBe('My Swiggy View');
      expect(view.createdAt).toBeDefined();
      expect(view.filters).toEqual({ platforms: ['SWIGGY'], search: 'pizza' });
      expect(view.sort).toBe('amount');
      expect(view.direction).toBe('asc');
      expect(view.columnVisibility).toEqual({ items: false });

      expect(mockStorage[SAVED_VIEWS_KEY]).toBeDefined();
      const stored = JSON.parse(mockStorage[SAVED_VIEWS_KEY]);
      expect(stored).toHaveLength(1);
      expect(stored[0].name).toBe('My Swiggy View');

      const loaded = loadSavedViews();
      expect(loaded).toHaveLength(1);
      expect(loaded[0]).toEqual(view);
    });

    it('supports saving with positional arguments', () => {
      const view = saveView(
        'Quick View',
        { verified_only: true },
        'date',
        'desc',
        { discount: false },
      );

      expect(view.name).toBe('Quick View');
      expect(view.filters).toEqual({ verified_only: true });
      expect(view.sort).toBe('date');
      expect(view.direction).toBe('desc');
      expect(view.columnVisibility).toEqual({ discount: false });

      const loaded = loadSavedViews();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].name).toBe('Quick View');
    });

    it('updates an existing view if the same id is provided', () => {
      const initial = saveView({
        name: 'Initial Name',
        filters: { platforms: ['ZOMATO'] },
      });

      const updated = saveView({
        id: initial.id,
        name: 'Updated Name',
        filters: { platforms: ['SWIGGY'] },
      });

      const loaded = loadSavedViews();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe(initial.id);
      expect(loaded[0].name).toBe('Updated Name');
      expect(loaded[0].filters).toEqual({ platforms: ['SWIGGY'] });
      expect(updated.name).toBe('Updated Name');
    });
  });

  describe('Scenario: Rename', () => {
    it('renames an existing view by id', () => {
      const v1 = saveView({ name: 'View 1', filters: {} });
      const v2 = saveView({ name: 'View 2', filters: {} });

      const updated = renameView(v1.id, 'Renamed View 1');
      expect(updated.find(v => v.id === v1.id)?.name).toBe('Renamed View 1');
      expect(updated.find(v => v.id === v2.id)?.name).toBe('View 2');

      const loaded = loadSavedViews();
      expect(loaded.find(v => v.id === v1.id)?.name).toBe('Renamed View 1');
    });

    it('ignores empty rename strings and preserves original name', () => {
      const v1 = saveView({ name: 'Keep Me', filters: {} });
      renameView(v1.id, '   ');

      const loaded = loadSavedViews();
      expect(loaded[0].name).toBe('Keep Me');
    });
  });

  describe('Scenario: Delete', () => {
    it('deletes a view by id', () => {
      const v1 = saveView({ name: 'View 1', filters: {} });
      const v2 = saveView({ name: 'View 2', filters: {} });

      const remaining = deleteView(v1.id);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(v2.id);

      const loaded = loadSavedViews();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe(v2.id);
    });

    it('handles deleting a non-existent id gracefully', () => {
      saveView({ name: 'View 1', filters: {} });
      const remaining = deleteView('non-existent-id');
      expect(remaining).toHaveLength(1);
    });
  });

  describe('Scenario: Safe storage and corruption resilience', () => {
    it('safely handles corrupt localStorage JSON and returns []', () => {
      mockStorage[SAVED_VIEWS_KEY] = '{{invalid-json--';
      expect(() => loadSavedViews()).not.toThrow();
      expect(loadSavedViews()).toEqual([]);
    });

    it('safely handles non-array stored data (string, number, object)', () => {
      mockStorage[SAVED_VIEWS_KEY] = JSON.stringify({ not: 'an-array' });
      expect(loadSavedViews()).toEqual([]);

      mockStorage[SAVED_VIEWS_KEY] = JSON.stringify('plain string');
      expect(loadSavedViews()).toEqual([]);

      mockStorage[SAVED_VIEWS_KEY] = JSON.stringify(42);
      expect(loadSavedViews()).toEqual([]);
    });

    it('filters out corrupted items inside the array', () => {
      mockStorage[SAVED_VIEWS_KEY] = JSON.stringify([
        null,
        123,
        'string',
        {},
        { id: 'v1' }, // missing name
        { id: 'v2', name: '' }, // empty name
        { id: 'v3', name: 'Valid View', filters: { search: 'cake' } },
      ]);

      const loaded = loadSavedViews();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe('v3');
      expect(loaded[0].name).toBe('Valid View');
      expect(loaded[0].filters).toEqual({ search: 'cake' });
    });

    it('handles localStorage throwing errors on read without throwing', () => {
      const failingStorage = {
        getItem: vi.fn(() => {
          throw new Error('Access denied (SecurityError)');
        }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      };
      Object.defineProperty(globalThis, 'localStorage', {
        value: failingStorage,
        writable: true,
        configurable: true,
      });

      expect(() => loadSavedViews()).not.toThrow();
      expect(loadSavedViews()).toEqual([]);
    });

    it('handles localStorage throwing errors on write without throwing', () => {
      const failingStorage = {
        getItem: vi.fn(() => null),
        setItem: vi.fn(() => {
          throw new Error('QuotaExceededError');
        }),
        removeItem: vi.fn(),
        clear: vi.fn(),
      };
      Object.defineProperty(globalThis, 'localStorage', {
        value: failingStorage,
        writable: true,
        configurable: true,
      });

      expect(() =>
        saveView({ name: 'Will Fail Persist', filters: {} }),
      ).not.toThrow();
      expect(() => deleteView('some-id')).not.toThrow();
      expect(() => renameView('some-id', 'New Name')).not.toThrow();
    });
  });
});
