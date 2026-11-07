import { describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { defaultFilters } from '../lib/filters';
import { FilterBar } from './FilterBar';

vi.mock('./FilterContext', () => ({
  useFilters: () => ({
    filters: { ...defaultFilters(), platforms: ['ZOMATO'] },
    update: vi.fn(),
    clear: vi.fn(),
    notice: '',
    clearNotice: vi.fn(),
    metadata: {
      data: {
        platforms: ['ZOMATO', 'SWIGGY'],
        restaurants: [{ id: 'r1', name: 'R1' }],
        cities: ['C1'],
        localities: ['L1'],
        cuisines: ['Italian'],
        payment_methods: ['CARD'],
        statuses: ['DELIVERED'],
      },
      isPlaceholderData: false,
    },
  }),
}));

describe('FilterBar (S-014)', () => {
  it('renders summary row elements', () => {
    const html = renderToString(<FilterBar />);
    expect(html).toContain('Date preset');
    expect(html).toContain('Platform');
    expect(html).toContain('Compare');
    expect(html).toContain('More filters');
  });

  it('shows active count badge when advanced filters active', () => {
    vi.doMock('./FilterContext', () => ({
      useFilters: () => ({
        filters: { ...defaultFilters(), veg: 'veg' },
        update: vi.fn(),
        clear: vi.fn(),
        notice: '',
        clearNotice: vi.fn(),
        metadata: { data: { platforms: [], restaurants: [], cities: [], localities: [], cuisines: [], payment_methods: [], statuses: [] }, isPlaceholderData: false },
      }),
    }));
    const html = renderToString(<FilterBar />);
    expect(html).toContain('More filters');
  });

  it('renders Clear all button', () => {
    const html = renderToString(<FilterBar />);
    expect(html).toContain('Clear all');
  });
});
