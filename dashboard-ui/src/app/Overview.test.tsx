import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { Overview } from './Overview';

let mockDashboardState: {
  data: any;
  isPending: boolean;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: any;
} = {
  data: null,
  isPending: false,
  isLoading: false,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
};

let mockCompareState: {
  data: any;
} = {
  data: null,
};

const mockUpdate = vi.fn();
const mockClear = vi.fn();

vi.mock('../hooks/api', () => ({
  useDashboard: () => mockDashboardState,
  useDashboardCompare: () => mockCompareState,
  useMetadata: () => ({ data: null }),
}));

vi.mock('./FilterContext', () => ({
  useFilters: () => ({
    filters: {},
    update: mockUpdate,
    clear: mockClear,
    notice: '',
    clearNotice: vi.fn(),
    metadata: { data: null, isPlaceholderData: false },
    applyCrossFilter: vi.fn(),
    undoCrossFilter: vi.fn(),
  }),
}));

vi.mock('./SyncStatusPanel', () => ({
  ScopeNotice: () => <div data-testid="scope-notice">Scope Notice Mock</div>,
}));

vi.mock('@/lib/highlight-bus', () => ({
  emitHighlight: vi.fn(),
  emitClear: vi.fn(),
  registerChart: vi.fn(() => () => {}),
}));

const sampleDashboardData = {
  kpis: {
    spend: 12500,
    orders: 45,
    aov: 277.78,
    fees: 450,
  },
  comparison: {
    percent_change: {
      spend: 12.5,
      orders: 8.0,
      aov: 4.1,
      fees: -2.3,
    },
  },
  charts: {
    insights: [
      {
        key: 'most_frequent_platform',
        text: 'Top platform',
        value: 'Swiggy',
        filter_patch: { platforms: ['SWIGGY'] },
      },
      {
        key: 'top_restaurant',
        text: 'Top restaurant',
        value: 'Biryani Blues',
        filter_patch: { restaurant_ids: ['r1'] },
      },
    ],
    kpi_history: [
      { month: '2024-01', spend: 6000, orders: 20 },
      { month: '2024-02', spend: 6500, orders: 25 },
    ],
    monthly: [
      { month: '2024-01', spend: 6000, orders: 20 },
      { month: '2024-02', spend: 6500, orders: 25 },
    ],
    platforms: [
      { platform: 'SWIGGY', spend: 8000, orders: 28, discounts: 500, fees: 300 },
      { platform: 'ZOMATO', spend: 4500, orders: 17, discounts: 200, fees: 150 },
    ],
    calendar: [
      { date: '2024-01-15', orders: 2, spend: 500 },
      { date: '2024-02-10', orders: 1, spend: 350 },
    ],
    top_restaurants: [
      { key: 'r1', name: 'Biryani Blues', amount: 3500, quantity: 12 },
      { key: 'r2', name: 'Pizza Hut', amount: 2000, quantity: 6 },
    ],
    top_dishes: [
      { key: 'd1', name: 'Chicken Biryani', amount: 2500, quantity: 10 },
      { key: 'd2', name: 'Garlic Bread', amount: 800, quantity: 8 },
    ],
    behavior: {
      orders_per_week: 3.2,
      longest_streak: 4,
    },
    food: {
      cuisines: [{ name: 'Biryani', count: 18 }],
    },
  },
};

function renderOverview() {
  return renderToString(
    <MemoryRouter>
      <Overview />
    </MemoryRouter>,
  );
}

describe('Overview page assembly (Phase P3a Gate)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders clean loading state when query.isPending is true', () => {
    mockDashboardState = {
      data: null,
      isPending: true,
      isLoading: true,
      isError: false,
      isFetching: true,
      refetch: vi.fn(),
    };

    const html = renderOverview();
    expect(html).toContain('Overview');
    expect(html).toContain('aria-label="Loading overview"');
    expect(html).toContain('role="status"');
    expect(html).toContain('Scope Notice Mock');
    // Ensure charts are not rendered during loading
    expect(html).not.toContain('Monthly spend and orders');
    expect(html).not.toContain('Platform split');
  });

  it('renders error state with retry button when query.isError is true', () => {
    mockDashboardState = {
      data: null,
      isPending: false,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch: vi.fn(),
    };

    const html = renderOverview();
    expect(html).toContain('could not load.');
    expect(html).toContain('Retry');
    expect(html).toContain('role="alert"');
  });

  it('renders empty state when data has no orders', () => {
    mockDashboardState = {
      data: {
        kpis: { orders: 0, spend: 0 },
        charts: {},
      },
      isPending: false,
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    };

    const html = renderOverview();
    expect(html).toContain('No orders match these filters');
    expect(html).toContain('Clear filters');
    expect(html).not.toContain('Monthly spend and orders');
  });

  it('renders all 6 component sections successfully when data is present', () => {
    mockDashboardState = {
      data: sampleDashboardData,
      isPending: false,
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    };
    mockCompareState = {
      data: {
        charts: {
          monthly: [{ month: '2023-01', spend: 5000, orders: 18 }],
        },
      },
    };

    const html = renderOverview();

    // 1. Header & Scope Notice
    expect(html).toContain('Overview</h1>');
    expect(html).toContain('Scope Notice Mock');

    // 2. Component 1: InsightStrip
    expect(html).toContain('Top platform');
    expect(html).toContain('Swiggy');
    expect(html).toContain('Top restaurant');
    expect(html).toContain('Biryani Blues');

    // 3. Component 2: OverviewKpis
    expect(html).toContain('Total spend');
    expect(html).toContain('Total orders');
    expect(html).toContain('Average order value');
    expect(html).toContain('Orders per week');
    expect(html).toContain('Top cuisine');
    expect(html).toContain('Delivery and fees');

    // 4. Component 3: MonthlyTrendChart (in Row 1 Col 1: lg:col-span-8)
    expect(html).toContain('Monthly spend and orders');
    expect(html).toContain('lg:col-span-8');

    // 5. Component 4: PlatformSplitChart (in Row 1 Col 2: lg:col-span-4)
    expect(html).toContain('Platform split');
    expect(html).toContain('lg:col-span-4');

    // 6. Component 5: CalendarHeatmapChart (in Row 2)
    expect(html).toContain('Daily order activity');

    // 7. Component 6: TopRestaurantsDishesChart (in Row 3)
    expect(html).toContain('Top restaurants and dishes');

    // Grid layout verification:
    expect(html).toContain('grid grid-cols-1 lg:grid-cols-12 gap-4');
  });

  it('cleanly hides InsightStrip when no insights exist', () => {
    const dataWithoutInsights = {
      ...sampleDashboardData,
      charts: {
        ...sampleDashboardData.charts,
        insights: [],
      },
    };
    mockDashboardState = {
      data: dataWithoutInsights,
      isPending: false,
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    };

    const html = renderOverview();
    expect(html).not.toContain('Top platform');
    expect(html).toContain('Total spend');
    expect(html).toContain('Monthly spend and orders');
  });
});
