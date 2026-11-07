import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { defaultFilters } from '../lib/filters';
import {
  Orders,
  formatOrderDate,
  getOrderVerificationStatus,
  OrderStatusChip,
  OrderAmountCell,
  PlatformBadge,
  HighlightText,
  QuickFilterChips,
  OrderSearchInput,
  debounceSearch,
  type Order,
} from './Orders';
import * as apiHooks from '../hooks/api';

vi.mock('../hooks/api', async (importOriginal) => {
  const actual = await importOriginal<typeof apiHooks>();
  return {
    ...actual,
    useOrders: vi.fn(),
    useBill: vi.fn(() => ({ data: undefined, isPending: false, isError: false, isPlaceholderData: false })),
  };
});

let mockCurrentFilters = defaultFilters();
const mockUpdate = vi.fn();
const mockClear = vi.fn();

vi.mock('./FilterContext', () => ({
  useFilters: () => ({
    filters: mockCurrentFilters,
    update: mockUpdate,
    clear: mockClear,
    notice: '',
    clearNotice: vi.fn(),
    metadata: {
      data: {
        platforms: ['SWIGGY', 'ZOMATO'],
        restaurants: [],
        cities: [],
        localities: [],
        cuisines: [],
        payment_methods: [],
        statuses: [],
      },
      isPlaceholderData: false,
    },
  }),
}));

const mockOrderBase: Order = {
  id: 'ord-1',
  account_id: 'acc-1',
  account_label: '••••1234',
  platform: 'SWIGGY',
  platform_order_id: 'SW-1001',
  order_timestamp: '2025-06-15T13:45:00',
  order_date: '2025-06-15',
  order_time: '13:45:00',
  order_status: 'DELIVERED',
  payment_method: 'UPI',
  restaurant_name: 'Biryani Express',
  address_label: 'Home',
  city: 'Bengaluru',
  items_summary: '2x Chicken Biryani, 1x Raita',
  final_amount_paid: 600,
  item_subtotal: 550,
  total_discount: 50,
  reported_savings: 50,
  delivery_fee: 40,
  packaging_fee: 20,
  platform_fee: 10,
  total_tax: 30,
  tip: 0,
  other_charges: 0,
  refund_amount: 0,
  fees: 70,
  food_discount: 50,
  delivery_fee_discount: 0,
  user_rating: 5,
  source_complete: true,
  reconciliation_difference: 0,
  financial_verified: true,
};

function renderOrders(url = '/orders') {
  return renderToString(
    <MemoryRouter initialEntries={[url]}>
      <Orders />
    </MemoryRouter>,
  );
}

describe('Orders table (S-070)', () => {
  beforeEach(() => {
    mockCurrentFilters = defaultFilters();
    vi.clearAllMocks();
  });

  describe('Verification status logic and chips', () => {
    it('identifies verified order when financial_verified is true', () => {
      expect(
        getOrderVerificationStatus({
          financial_verified: true,
          reconciliation_difference: 0,
        }),
      ).toBe('verified');
    });

    it('identifies unbalanced order when reconciliation difference exceeds 1', () => {
      expect(
        getOrderVerificationStatus({
          financial_verified: false,
          reconciliation_difference: 15.5,
        }),
      ).toBe('unbalanced');
      expect(
        getOrderVerificationStatus({
          financial_verified: false,
          reconciliation_difference: -2.0,
        }),
      ).toBe('unbalanced');
    });

    it('identifies unverified order when not verified and difference within 1 or null', () => {
      expect(
        getOrderVerificationStatus({
          financial_verified: false,
          reconciliation_difference: 0,
        }),
      ).toBe('unverified');
      expect(
        getOrderVerificationStatus({
          financial_verified: false,
          reconciliation_difference: null,
        }),
      ).toBe('unverified');
    });

    it('respects explicit status if provided in order object', () => {
      expect(getOrderVerificationStatus({ status: 'unbalanced' })).toBe('unbalanced');
      expect(getOrderVerificationStatus({ verification_status: 'verified' })).toBe('verified');
    });

    it('renders OrderStatusChip with distinct icon and text for each status', () => {
      const verifiedHtml = renderToString(<OrderStatusChip status="verified" />);
      expect(verifiedHtml).toContain('Verified');
      expect(verifiedHtml).toContain('data-status="verified"');

      const unbalancedHtml = renderToString(<OrderStatusChip status="unbalanced" />);
      expect(unbalancedHtml).toContain('Unbalanced');
      expect(unbalancedHtml).toContain('data-status="unbalanced"');

      const unverifiedHtml = renderToString(<OrderStatusChip status="unverified" />);
      expect(unverifiedHtml).toContain('Unverified');
      expect(unverifiedHtml).toContain('data-status="unverified"');
    });
  });

  describe('Date and amount cell helpers', () => {
    it('formats localized order dates cleanly', () => {
      const formatted = formatOrderDate('2025-06-15T13:45:00');
      expect(formatted).toMatch(/15.*Jun.*2025/);
      expect(formatOrderDate(null)).toBe('—');
    });

    it('renders OrderAmountCell with proportional inline bar and ₹ formatting', () => {
      const html = renderToString(<OrderAmountCell amount={500} maxAmount={1000} />);
      expect(html).toContain('₹');
      expect(html).toContain('500');
      expect(html).toContain('data-testid="amount-bar"');
      expect(html).toContain('style="width:50%"');
      expect(html).toContain('role="progressbar"');
      expect(html).toContain('aria-valuenow="500"');
      expect(html).toContain('aria-valuemax="1000"');
    });

    it('renders PlatformBadge with platform branding', () => {
      const swiggyHtml = renderToString(<PlatformBadge platform="SWIGGY" />);
      expect(swiggyHtml).toContain('SWIGGY');
      expect(swiggyHtml).toContain('data-platform="SWIGGY"');

      const zomatoHtml = renderToString(<PlatformBadge platform="ZOMATO" />);
      expect(zomatoHtml).toContain('ZOMATO');
      expect(zomatoHtml).toContain('data-platform="ZOMATO"');
    });
  });

  describe('Scenario: Columns and data rendering', () => {
    it('renders date, platform, restaurant, items summary, proportional amount bar, and status chip in rows', () => {
      const ordersData: Order[] = [
        {
          ...mockOrderBase,
          id: 'ord-1',
          restaurant_name: 'Dosa Plaza',
          items_summary: '3x Masala Dosa',
          final_amount_paid: 300,
          financial_verified: true,
          platform: 'SWIGGY',
        },
        {
          ...mockOrderBase,
          id: 'ord-2',
          restaurant_name: 'Pizza Corner',
          items_summary: '1x Large Farmhouse Pizza',
          final_amount_paid: 600,
          financial_verified: false,
          reconciliation_difference: 25,
          platform: 'ZOMATO',
        },
        {
          ...mockOrderBase,
          id: 'ord-3',
          restaurant_name: 'Burger Haven',
          items_summary: '2x Veg Whopper',
          final_amount_paid: 450,
          financial_verified: false,
          reconciliation_difference: 0,
          platform: 'SWIGGY',
        },
      ];

      vi.mocked(apiHooks.useOrders).mockReturnValue({
        data: {
          rows: ordersData,
          total: 3,
          page: 1,
          page_size: 50,
          filtered_total_amount: 1350,
          generated_at: 'now',
          filters_applied: defaultFilters(),
        },
        isPending: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof apiHooks.useOrders>);

      const html = renderOrders();

      // Restaurant names
      expect(html).toContain('Dosa Plaza');
      expect(html).toContain('Pizza Corner');
      expect(html).toContain('Burger Haven');

      // Items summary
      expect(html).toContain('3x Masala Dosa');
      expect(html).toContain('1x Large Farmhouse Pizza');
      expect(html).toContain('2x Veg Whopper');

      // Platforms
      expect(html).toContain('SWIGGY');
      expect(html).toContain('ZOMATO');

      // Status chips: verified, unbalanced, unverified
      expect(html).toContain('Verified');
      expect(html).toContain('Unbalanced');
      expect(html).toContain('Unverified');

      // Proportional inline amount bars
      expect(html).toContain('data-testid="amount-bar"');
      // Max amount is 600; 300 is 50%, 600 is 100%, 450 is 75%
      expect(html).toContain('style="width:50%"');
      expect(html).toContain('style="width:100%"');
      expect(html).toContain('style="width:75%"');
    });
  });

  describe('Scenario: Sticky header', () => {
    it('applies sticky top-0 z-10 bg-card on header row so headers stay visible during scroll', () => {
      vi.mocked(apiHooks.useOrders).mockReturnValue({
        data: {
          rows: [mockOrderBase],
          total: 1,
          page: 1,
          page_size: 50,
          filtered_total_amount: 600,
          generated_at: 'now',
          filters_applied: defaultFilters(),
        },
        isPending: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof apiHooks.useOrders>);

      const html = renderOrders();
      expect(html).toContain('sticky top-0 z-10');
      expect(html).toContain('orders-scroll');
    });
  });

  describe('Scenario: Sorting', () => {
    it('renders headers sort with aria-sort and visible direction indicator', () => {
      vi.mocked(apiHooks.useOrders).mockReturnValue({
        data: {
          rows: [mockOrderBase],
          total: 1,
          page: 1,
          page_size: 50,
          filtered_total_amount: 600,
          generated_at: 'now',
          filters_applied: defaultFilters(),
        },
        isPending: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof apiHooks.useOrders>);

      // Default URL: sort is date descending
      const htmlDefault = renderOrders('/orders?sort=date&direction=desc');
      expect(htmlDefault).toContain('aria-sort="descending"');
      expect(htmlDefault).toContain('data-testid="sort-desc"');
      expect(htmlDefault).toContain('aria-sort="none"');
      expect(htmlDefault).toContain('data-testid="sort-none"');

      // Sorted ascending by amount
      const htmlAsc = renderOrders('/orders?sort=amount&direction=asc');
      expect(htmlAsc).toContain('aria-sort="ascending"');
      expect(htmlAsc).toContain('data-testid="sort-asc"');
    });
  });

  describe('Scenario: States (loading and empty)', () => {
    it('renders row skeletons when loading', () => {
      vi.mocked(apiHooks.useOrders).mockReturnValue({
        data: undefined,
        isPending: true,
        isFetching: true,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof apiHooks.useOrders>);

      const html = renderOrders();
      expect(html).toContain('orders-skeleton');
      expect(html).toContain('data-testid="orders-skeleton"');
      expect(html).toContain('data-testid="skeleton-row"');
      expect(html).toContain('aria-busy="true"');
    });

    it('renders EmptyState component with Clear filters button when empty', () => {
      vi.mocked(apiHooks.useOrders).mockReturnValue({
        data: {
          rows: [],
          total: 0,
          page: 1,
          page_size: 50,
          filtered_total_amount: 0,
          generated_at: 'now',
          filters_applied: defaultFilters(),
        },
        isPending: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof apiHooks.useOrders>);

      const html = renderOrders();
      expect(html).toContain('No orders match these filters');
      expect(html).toContain('Clear filters');
      expect(html).toContain('data-testid="orders-empty-state"');
    });
  });

  describe('Scenario: Large data and virtualization', () => {
    it('mounts virtualized table without error for large order counts', () => {
      const largeRows: Order[] = Array.from({ length: 100 }, (_, i) => ({
        ...mockOrderBase,
        id: `large-order-${i}`,
        platform_order_id: `PL-${i}`,
        restaurant_name: `Restaurant ${i}`,
        final_amount_paid: 100 + i * 10,
        financial_verified: i % 2 === 0,
        reconciliation_difference: i % 3 === 0 ? 5 : 0,
      }));

      vi.mocked(apiHooks.useOrders).mockReturnValue({
        data: {
          rows: largeRows,
          total: 5000,
          page: 1,
          page_size: 100,
          filtered_total_amount: 550000,
          generated_at: 'now',
          filters_applied: defaultFilters(),
        },
        isPending: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof apiHooks.useOrders>);

      const html = renderOrders('/orders?page=1&page_size=100');
      expect(html).toContain('orders-scroll-container');
      expect(html).toContain('Showing');
      expect(html).toContain('5000');
    });
  });
});

describe('Orders search and quick filters (S-071)', () => {
  beforeEach(() => {
    mockCurrentFilters = defaultFilters();
    vi.clearAllMocks();
  });

  describe('Scenario: Pinned controls', () => {
    it('renders a search box and quick filters (Platform, Verified, Needs review) above the table', () => {
      vi.mocked(apiHooks.useOrders).mockReturnValue({
        data: {
          rows: [mockOrderBase],
          total: 1,
          page: 1,
          page_size: 50,
          filtered_total_amount: 600,
          generated_at: 'now',
          filters_applied: defaultFilters(),
        },
        isPending: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof apiHooks.useOrders>);

      const html = renderOrders();

      // Pinned controls container exists and sits above the table scroll container
      expect(html).toContain('data-testid="orders-pinned-controls"');
      const controlsPos = html.indexOf('data-testid="orders-pinned-controls"');
      const tablePos = html.indexOf('orders-scroll');
      expect(controlsPos).toBeGreaterThan(-1);
      expect(tablePos).toBeGreaterThan(-1);
      expect(controlsPos).toBeLessThan(tablePos);

      // Search input field with icon, placeholder, and accessible attributes
      expect(html).toContain('role="searchbox"');
      expect(html).toContain('aria-label="Search orders"');
      expect(html).toContain('placeholder="Search orders, restaurants, items…"');

      // Quick filters: Platform, Verified, Needs review
      expect(html).toContain('Platform');
      expect(html).toContain('Swiggy');
      expect(html).toContain('Zomato');
      expect(html).toContain('Verified');
      expect(html).toContain('Needs review');
    });

    it('renders clear button on search input when value is non-empty and hides it when empty', () => {
      const emptyHtml = renderToString(
        <OrderSearchInput value="" onChange={vi.fn()} onClear={vi.fn()} />,
      );
      expect(emptyHtml).not.toContain('aria-label="Clear search"');

      const filledHtml = renderToString(
        <OrderSearchInput value="biryani" onChange={vi.fn()} onClear={vi.fn()} />,
      );
      expect(filledHtml).toContain('aria-label="Clear search"');
    });
  });

  describe('Scenario: Quick filter toggling', () => {
    it('toggles Platform quick filter chips and updates platforms in FilterContext', () => {
      const onTogglePlatform = vi.fn();
      const htmlInactive = renderToString(
        <QuickFilterChips
          platforms={['SWIGGY', 'ZOMATO']}
          activePlatforms={[]}
          verifiedOnly={false}
          anomaly="all"
          onTogglePlatform={onTogglePlatform}
          onToggleVerified={vi.fn()}
          onToggleAnomaly={vi.fn()}
        />,
      );
      expect(htmlInactive).toContain('data-platform="SWIGGY"');
      expect(htmlInactive).toContain('data-platform="ZOMATO"');
      expect(htmlInactive).toContain('aria-pressed="false"');

      const htmlActive = renderToString(
        <QuickFilterChips
          platforms={['SWIGGY', 'ZOMATO']}
          activePlatforms={['SWIGGY']}
          verifiedOnly={false}
          anomaly="all"
          onTogglePlatform={onTogglePlatform}
          onToggleVerified={vi.fn()}
          onToggleAnomaly={vi.fn()}
        />,
      );
      expect(htmlActive).toContain('data-platform="SWIGGY"');
      expect(htmlActive).toContain('aria-pressed="true"');

      // Test platform array toggling calculation
      const current = ['SWIGGY'];
      const afterTogglingSwiggyOff = current.includes('SWIGGY')
        ? current.filter(p => p !== 'SWIGGY')
        : [...current, 'SWIGGY'];
      expect(afterTogglingSwiggyOff).toEqual([]);

      const afterTogglingZomatoOn = current.includes('ZOMATO')
        ? current.filter(p => p !== 'ZOMATO')
        : [...current, 'ZOMATO'];
      expect(afterTogglingZomatoOn).toEqual(['SWIGGY', 'ZOMATO']);
    });

    it('toggles Verified quick filter chip between true and false', () => {
      const onToggleVerified = vi.fn();
      const htmlUnverified = renderToString(
        <QuickFilterChips
          platforms={['SWIGGY', 'ZOMATO']}
          activePlatforms={[]}
          verifiedOnly={false}
          anomaly="all"
          onTogglePlatform={vi.fn()}
          onToggleVerified={onToggleVerified}
          onToggleAnomaly={vi.fn()}
        />,
      );
      expect(htmlUnverified).toContain('Verified');
      expect(htmlUnverified).toContain('data-active="false"');
      expect(htmlUnverified).toContain('aria-pressed="false"');

      const htmlVerified = renderToString(
        <QuickFilterChips
          platforms={['SWIGGY', 'ZOMATO']}
          activePlatforms={[]}
          verifiedOnly={true}
          anomaly="all"
          onTogglePlatform={vi.fn()}
          onToggleVerified={onToggleVerified}
          onToggleAnomaly={vi.fn()}
        />,
      );
      expect(htmlVerified).toContain('data-active="true"');
      expect(htmlVerified).toContain('aria-pressed="true"');
    });

    it('toggles Needs review quick filter chip between review and all', () => {
      const onToggleAnomaly = vi.fn();
      const htmlAll = renderToString(
        <QuickFilterChips
          platforms={['SWIGGY', 'ZOMATO']}
          activePlatforms={[]}
          verifiedOnly={false}
          anomaly="all"
          onTogglePlatform={vi.fn()}
          onToggleVerified={vi.fn()}
          onToggleAnomaly={onToggleAnomaly}
        />,
      );
      expect(htmlAll).toContain('Needs review');
      expect(htmlAll).toContain('data-active="false"');
      expect(htmlAll).toContain('aria-pressed="false"');

      const htmlReview = renderToString(
        <QuickFilterChips
          platforms={['SWIGGY', 'ZOMATO']}
          activePlatforms={[]}
          verifiedOnly={false}
          anomaly="review"
          onTogglePlatform={vi.fn()}
          onToggleVerified={vi.fn()}
          onToggleAnomaly={onToggleAnomaly}
        />,
      );
      expect(htmlReview).toContain('data-active="true"');
      expect(htmlReview).toContain('aria-pressed="true"');
    });
  });

  describe('Scenario: Search behavior (250ms debounce)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('debounces search filter updates by 250ms', () => {
      const onSearchChange = vi.fn();
      const { debounced } = debounceSearch(onSearchChange, 250);

      // User types "dosa"
      debounced('dosa');
      expect(onSearchChange).not.toHaveBeenCalled();

      // At 249ms, debounce has not fired
      vi.advanceTimersByTime(249);
      expect(onSearchChange).not.toHaveBeenCalled();

      // At 250ms, update triggers
      vi.advanceTimersByTime(1);
      expect(onSearchChange).toHaveBeenCalledTimes(1);
      expect(onSearchChange).toHaveBeenCalledWith('dosa');
    });

    it('resets 250ms countdown when typing continues rapidly', () => {
      const onSearchChange = vi.fn();
      const { debounced } = debounceSearch(onSearchChange, 250);

      debounced('b');
      vi.advanceTimersByTime(100);

      debounced('bir');
      vi.advanceTimersByTime(100);

      debounced('biryani');
      vi.advanceTimersByTime(200);
      expect(onSearchChange).not.toHaveBeenCalled();

      // 250ms after the last keystroke
      vi.advanceTimersByTime(50);
      expect(onSearchChange).toHaveBeenCalledTimes(1);
      expect(onSearchChange).toHaveBeenCalledWith('biryani');
    });

    it('cancels pending debounce on cancel call', () => {
      const onSearchChange = vi.fn();
      const { debounced, cancel } = debounceSearch(onSearchChange, 250);

      debounced('pizza');
      vi.advanceTimersByTime(150);
      cancel();

      vi.advanceTimersByTime(200);
      expect(onSearchChange).not.toHaveBeenCalled();
    });

    it('normalizes empty search strings to null', () => {
      const onSearchChange = vi.fn();
      const { debounced } = debounceSearch(onSearchChange, 250);

      debounced('   ');
      vi.advanceTimersByTime(250);
      expect(onSearchChange).toHaveBeenCalledWith(null);
    });
  });

  describe('Scenario: Matched text highlight', () => {
    it('HighlightText wraps matching text in <mark> with accessible styling', () => {
      const html = renderToString(
        <HighlightText text="Biryani Express" query="biryani" />,
      );
      expect(html).toContain(
        '<mark class="bg-amber-200/60 dark:bg-amber-900/50 text-inherit rounded-xs px-0.5">Biryani</mark> Express',
      );
    });

    it('HighlightText highlights matching substrings case-insensitively while preserving original text case', () => {
      const html = renderToString(
        <HighlightText text="2x Chicken Biryani, 1x Raita" query="CHICKEN" />,
      );
      expect(html).toContain(
        '2x <mark class="bg-amber-200/60 dark:bg-amber-900/50 text-inherit rounded-xs px-0.5">Chicken</mark> Biryani, 1x Raita',
      );
    });

    it('HighlightText safely handles regex metacharacters in query', () => {
      const html = renderToString(
        <HighlightText text="Meal (Special + Extra)" query="(special +" />,
      );
      expect(html).toContain(
        'Meal <mark class="bg-amber-200/60 dark:bg-amber-900/50 text-inherit rounded-xs px-0.5">(Special +</mark> Extra)',
      );
    });

    it('HighlightText returns plain text when query is empty, whitespace, or null', () => {
      expect(renderToString(<HighlightText text="Pizza Corner" query="" />)).toBe('Pizza Corner');
      expect(renderToString(<HighlightText text="Pizza Corner" query="   " />)).toBe('Pizza Corner');
      expect(renderToString(<HighlightText text="Pizza Corner" query={null} />)).toBe('Pizza Corner');
      expect(renderToString(<HighlightText text="Pizza Corner" query={undefined} />)).toBe('Pizza Corner');
      expect(renderToString(<HighlightText text={null} query="pizza" />)).toBe('');
    });

    it('highlights matching text in restaurant name and items summary in Orders table rows when search is active', () => {
      mockCurrentFilters = {
        ...defaultFilters(),
        search: 'biryani',
      };

      const orderWithMatches: Order = {
        ...mockOrderBase,
        id: 'ord-highlight-1',
        restaurant_name: 'Biryani Express',
        items_summary: '2x Chicken Biryani, 1x Raita',
        final_amount_paid: 600,
      };

      vi.mocked(apiHooks.useOrders).mockReturnValue({
        data: {
          rows: [orderWithMatches],
          total: 1,
          page: 1,
          page_size: 50,
          filtered_total_amount: 600,
          generated_at: 'now',
          filters_applied: mockCurrentFilters,
        },
        isPending: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof apiHooks.useOrders>);

      const html = renderOrders('/orders?search=biryani');

      // Expect <mark> with the exact accessible styling to appear in matching rows
      expect(html).toContain(
        '<mark class="bg-amber-200/60 dark:bg-amber-900/50 text-inherit rounded-xs px-0.5">Biryani</mark>',
      );

      // Verify it appears in restaurant column
      expect(html).toContain(
        '<mark class="bg-amber-200/60 dark:bg-amber-900/50 text-inherit rounded-xs px-0.5">Biryani</mark> Express',
      );

      // Verify it appears in items column
      expect(html).toContain(
        '2x Chicken <mark class="bg-amber-200/60 dark:bg-amber-900/50 text-inherit rounded-xs px-0.5">Biryani</mark>, 1x Raita',
      );
    });
  });
});
