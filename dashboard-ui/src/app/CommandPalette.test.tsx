import { describe, expect, it, beforeEach, vi } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { Providers } from './providers';
import { FilterProvider } from './FilterContext';
import {
  CommandPalette,
  activateSavedView,
  saveCurrentViewFromPalette,
} from './CommandPalette';
import {
  SAVED_VIEWS_KEY,
  type SavedView,
} from '../lib/saved-views';

vi.mock('@radix-ui/react-dialog', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

let mockStorage: Record<string, string> = {};

function render(open = false, initialPath = '/') {
  return renderToString(
    <Providers>
      <MemoryRouter initialEntries={[initialPath]}>
        <FilterProvider>
          <CommandPalette initialOpen={open} />
        </FilterProvider>
      </MemoryRouter>
    </Providers>,
  );
}

describe('CommandPalette (S-016 & S-073)', () => {
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

  it('renders trigger button', () => {
    const html = render();
    expect(html).toContain('Commands');
    expect(html).toContain('Ctrl K');
  });

  describe('S-073: Saved views in CommandPalette', () => {
    it('renders "Save current view" action under Saved views group', () => {
      const html = render(true);
      expect(html).toContain('Saved views');
      expect(html).toContain('Save current view');
    });

    it('dynamically displays saved views from food-khata-views in command list with Bookmark icon', () => {
      mockStorage[SAVED_VIEWS_KEY] = JSON.stringify([
        {
          id: 'v1',
          name: 'Healthy Salads',
          createdAt: new Date().toISOString(),
          filters: { search: 'salad' },
          sort: 'date',
          direction: 'desc',
        },
        {
          id: 'v2',
          name: 'Weekend Biryani',
          createdAt: new Date().toISOString(),
          filters: { platforms: ['SWIGGY'], search: 'biryani' },
          sort: 'amount',
          direction: 'asc',
        },
      ]);

      const html = render(true);
      expect(html).toContain('Healthy Salads');
      expect(html).toContain('Weekend Biryani');
    });

    it('activates a saved view: applies filters, column visibility, sort, and navigates to /orders', () => {
      const mockUpdate = vi.fn();
      const mockNavigate = vi.fn();
      const mockSavePrefs = vi.fn();

      const view: SavedView = {
        id: 'view-1',
        name: 'Top Swiggy Orders',
        createdAt: new Date().toISOString(),
        filters: { platforms: ['SWIGGY'], search: 'pizza' },
        sort: 'amount',
        direction: 'desc',
        columnVisibility: { items: false, fees: true },
      };

      activateSavedView(view, {
        update: mockUpdate,
        navigate: mockNavigate,
        currentSearch: '?account=acc-1',
        savePrefs: mockSavePrefs,
      });

      // Filter context updated
      expect(mockUpdate).toHaveBeenCalledWith(view.filters);

      // Table prefs saved
      expect(mockSavePrefs).toHaveBeenCalledWith({
        columnVisibility: { items: false, fees: true },
      });

      // Navigated to /orders with serialized search params including sort & direction
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/orders',
          search: expect.stringMatching(/platforms=SWIGGY/),
        }),
      );
      const call = mockNavigate.mock.calls[0][0];
      expect(call.search).toContain('sort=amount');
      expect(call.search).toContain('direction=desc');
      expect(call.search).toContain('page=1');
    });

    it('saves current view from palette and lists it in the palette', () => {
      const saved = saveCurrentViewFromPalette({
        filters: { platforms: ['ZOMATO'] },
        search: '?sort=amount&direction=asc',
      });

      expect(saved.id).toBeDefined();
      expect(mockStorage[SAVED_VIEWS_KEY]).toBeDefined();
      const stored = JSON.parse(mockStorage[SAVED_VIEWS_KEY]);
      expect(stored).toHaveLength(1);
      expect(stored[0].name).toBe(saved.name);
      expect(stored[0].filters).toEqual({ platforms: ['ZOMATO'] });
      expect(stored[0].sort).toBe('amount');
      expect(stored[0].direction).toBe('asc');

      const html = render(true);
      expect(html).toContain(saved.name);
    });

    it('corrupted or unavailable storage does not break the palette', () => {
      mockStorage[SAVED_VIEWS_KEY] = '{{invalid-json--';

      expect(() => render(true)).not.toThrow();
      const html = render(true);
      expect(html).toContain('Saved views');
      expect(html).toContain('Save current view');
    });
  });
});
