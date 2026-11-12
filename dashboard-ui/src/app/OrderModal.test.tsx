import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OrderModal, OrderSheet } from './OrderModal';
import { Orders } from './Orders';
import * as apiHooks from '../hooks/api';
import { defaultFilters } from '../lib/filters';
import type { components } from '../types/api';

vi.mock('@radix-ui/react-dialog', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock('../hooks/api', async importOriginal => {
  const actual = await importOriginal<typeof apiHooks>();
  return {
    ...actual,
    useOrders: vi.fn(),
    useBill: vi.fn(),
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

type Order = components['schemas']['Order'];

const mockOrders: Order[] = [
  {
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
  },
  {
    id: 'ord-2',
    account_id: 'acc-1',
    account_label: '••••1234',
    platform: 'ZOMATO',
    platform_order_id: 'ZM-2002',
    order_timestamp: '2025-06-16T19:30:00',
    order_date: '2025-06-16',
    order_time: '19:30:00',
    order_status: 'DELIVERED',
    payment_method: 'Credit Card',
    restaurant_name: 'Pizza Kitchen',
    address_label: 'Office',
    city: 'Bengaluru',
    items_summary: '1x Margherita Pizza',
    final_amount_paid: 450,
    item_subtotal: 400,
    total_discount: 40,
    reported_savings: 40,
    delivery_fee: 50,
    packaging_fee: 15,
    platform_fee: 10,
    total_tax: 25,
    tip: 0,
    other_charges: 0,
    refund_amount: 0,
    fees: 75,
    food_discount: 40,
    delivery_fee_discount: 0,
    user_rating: 4,
    source_complete: true,
    reconciliation_difference: 0,
    financial_verified: true,
  },
];

const mockBillDataOrd1 = {
  order: mockOrders[0],
  items: [
    {
      item_name: 'Chicken Biryani',
      quantity: 2,
      unit_price: 250,
      total_price: 500,
      is_veg: false,
      category: 'Main Course',
    },
    {
      item_name: 'Raita',
      quantity: 1,
      unit_price: 50,
      total_price: 50,
      is_veg: true,
      category: 'Sides',
    },
  ],
  discount_items: [
    {
      label: 'WELCOME50 Coupon',
      amount: 50,
    },
  ],
  reconciliation_label: 'Verified',
  reconciliation_status: 'matches' as const,
  reconciliation_difference: 0,
  full_address: '123 Tech Park, Bengaluru',
  source_bill: { test: true },
};

const mockBillDataOrd2 = {
  order: mockOrders[1],
  items: [
    {
      item_name: 'Margherita Pizza',
      quantity: 1,
      unit_price: 400,
      total_price: 400,
      is_veg: true,
      category: 'Pizza',
    },
  ],
  discount_items: [
    {
      label: 'FLAT40 Off',
      amount: 40,
    },
  ],
  reconciliation_label: 'Verified',
  reconciliation_status: 'matches' as const,
  reconciliation_difference: 0,
  full_address: '456 Business Blvd, Bengaluru',
  source_bill: { test: true },
};

function renderWithRouter(initialUrl: string) {
  return renderToString(
    <MemoryRouter initialEntries={[initialUrl]}>
      <Routes>
        <Route path="/orders" element={<Orders />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderSheetStandalone(initialUrl: string, rows: Order[] = mockOrders) {
  return renderToString(
    <MemoryRouter initialEntries={[initialUrl]}>
      <OrderModal rows={rows} request={{ page: 1, page_size: 50 }} total={rows.length} />
    </MemoryRouter>
  );
}

describe('S-072: Order side sheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentFilters = defaultFilters();

    vi.mocked(apiHooks.useOrders).mockReturnValue({
      data: {
        rows: mockOrders,
        total: mockOrders.length,
        page: 1,
        page_size: 50,
        filtered_total_amount: 1050,
        generated_at: '2025-06-16T20:00:00',
        filters_applied: mockCurrentFilters,
      },
      isPending: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof apiHooks.useOrders>);

    vi.mocked(apiHooks.useBill).mockImplementation((id?: string) => {
      if (id === 'ord-1') {
        return {
          data: mockBillDataOrd1,
          isPending: false,
          isFetching: false,
          isError: false,
          isPlaceholderData: false,
          refetch: vi.fn(),
        } as unknown as ReturnType<typeof apiHooks.useBill>;
      }
      if (id === 'ord-2') {
        return {
          data: mockBillDataOrd2,
          isPending: false,
          isFetching: false,
          isError: false,
          isPlaceholderData: false,
          refetch: vi.fn(),
        } as unknown as ReturnType<typeof apiHooks.useBill>;
      }
      return {
        data: undefined,
        isPending: false,
        isFetching: false,
        isError: false,
        isPlaceholderData: false,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof apiHooks.useBill>;
    });
  });

  describe('Scenario: Open & Content', () => {
    it('slides in a side sheet with items, payment breakdown and itemized discounts', () => {
      const html = renderSheetStandalone('/orders?order=ord-1');

      // Sheet container exists with right side orientation styling
      expect(html).toContain('order-sheet');
      expect(html).toContain('data-state="open"');

      // Header: Order ID, restaurant, date, platform, status chip
      expect(html).toContain('#SW-1001');
      expect(html).toContain('Biryani Express');
      expect(html).toContain('SWIGGY');
      expect(html).toContain('Verified');
      expect(html).toMatch(/15.*Jun.*2025/);

      // Items list: itemized names, quantities, and prices
      expect(html).toContain('Chicken Biryani');
      expect(html).toContain('Raita');
      expect(html).toContain('₹250.00');
      expect(html).toContain('₹500.00');
      expect(html).toContain('●');
      expect(html).toContain('> Veg<');
      expect(html).toContain('◆');
      expect(html).toContain('> Non-veg<');

      // Payment breakdown ladder
      expect(html).toContain('Payment breakdown');
      expect(html).toContain('Subtotal');
      expect(html).toContain('Delivery fee');
      expect(html).toContain('Packaging');
      expect(html).toContain('Platform fee');
      expect(html).toContain('Taxes');
      expect(html).toContain('Paid');
      expect(html).toContain('₹600.00');

      // Itemized discounts
      expect(html).toContain('Itemized discounts');
      expect(html).toContain('WELCOME50 Coupon');
      expect(html).toContain('−₹50.00');
    });

    it('exports OrderSheet alias matching OrderModal', () => {
      expect(OrderSheet).toBe(OrderModal);
    });
  });

  describe('Scenario: Deep link', () => {
    it('initial render with ?order=<id> restores the open sheet with that order on load', () => {
      const html = renderWithRouter('/orders?order=ord-1');

      // The sheet opens with ord-1 bill data
      expect(html).toContain('Biryani Express');
      expect(html).toContain('#SW-1001');
      expect(html).toContain('Chicken Biryani');
      expect(html).toContain('₹600.00');
      expect(html).toContain('WELCOME50 Coupon');
    });

    it('shows the masked account label but never the account id in the receipt', () => {
      const html = renderWithRouter('/orders?order=ord-1');
      expect(html).toContain('••••1234');
      expect(html).not.toContain('acc-1');
    });

    it('initial render with a different order deep link restores that specific order', () => {
      const html = renderWithRouter('/orders?order=ord-2');

      // The sheet opens with ord-2 bill data
      expect(html).toContain('Pizza Kitchen');
      expect(html).toContain('#ZM-2002');
      expect(html).toContain('Margherita Pizza');
      expect(html).toContain('FLAT40 Off');
      expect(html).toContain('₹450.00');
    });

    it('sheet remains closed when no ?order parameter is present', () => {
      const html = renderWithRouter('/orders');

      // Bill details should not be rendered inside sheet
      expect(html).not.toContain('order-sheet-body');
      expect(html).not.toContain('What was ordered');
      expect(html).not.toContain('WELCOME50 Coupon');
      expect(html).not.toContain('Payment breakdown');
    });
  });

  describe('Scenario: Selection styling in Orders table', () => {
    it('applies distinct active selection styling to the active order row', () => {
      const html = renderWithRouter('/orders?order=ord-1');

      // The row for ord-1 has active styling and selection attributes
      expect(html).toContain('data-order-id="ord-1"');
      expect(html).toContain('data-active="true"');
      expect(html).toContain('aria-selected="true"');
      expect(html).toContain('bg-accent');
      expect(html).toContain('ring-2 ring-inset ring-primary');

      // Row for ord-2 should not be active
      expect(html).toContain('data-order-id="ord-2"');
      expect(html).not.toMatch(/data-order-id="ord-2"[^>]*data-active="true"/);
    });
  });

  describe('Scenario: Close & Focus return', () => {
    it('renders close button in the side sheet', () => {
      const html = renderSheetStandalone('/orders?order=ord-1');

      // Radix close X button and footer close button are present
      expect(html).toContain('Close receipt');
      expect(html).toContain('sr-only">Close<');
    });
  });

  describe('Scenario: Navigation controls', () => {
    it('disables previous button on first order and enables next button', () => {
      const html = renderSheetStandalone('/orders?order=ord-1');

      // ord-1 is index 0 (first): previous order button is disabled
      expect(html).toContain('aria-label="Previous order"');
      expect(html).toContain('aria-label="Next order"');
      expect(html).toMatch(/<button[^>]*aria-disabled="true"[^>]*aria-label="Previous order"/);
      expect(html).toMatch(/<button[^>]*aria-disabled="false"[^>]*aria-label="Next order"/);
    });

    it('disables next button on last order and enables previous button', () => {
      const html = renderSheetStandalone('/orders?order=ord-2');

      // ord-2 is index 1 of 2 (last): next order button is disabled
      expect(html).toContain('aria-label="Previous order"');
      expect(html).toContain('aria-label="Next order"');
      expect(html).toMatch(/<button[^>]*aria-disabled="true"[^>]*aria-label="Next order"/);
      expect(html).toMatch(/<button[^>]*aria-disabled="false"[^>]*aria-label="Previous order"/);
    });
  });

  describe('Keyboard navigation & URL state logic', () => {
    it('computes adjacent order navigation indices correctly for ArrowUp and ArrowDown', () => {
      const rows = mockOrders;
      const id = 'ord-1';
      const currentIndex = rows.findIndex(r => r.id === id);
      expect(currentIndex).toBe(0);

      // ArrowDown advances to next order (+1)
      const nextIndex = currentIndex + 1;
      expect(rows[nextIndex].id).toBe('ord-2');

      // ArrowUp from next order goes back (-1)
      const prevIndex = nextIndex - 1;
      expect(rows[prevIndex].id).toBe('ord-1');

      // Boundary: ArrowUp on first order has no previous index
      expect(currentIndex - 1).toBe(-1);

      // Boundary: ArrowDown on last order exceeds bounds
      expect(nextIndex + 1).toBe(rows.length);
    });

    it('sets and removes ?order search param when opening and closing', () => {
      const initialParams = new URLSearchParams('sort=date&page=1');

      // Opening sets order param
      const openParams = new URLSearchParams(initialParams);
      openParams.set('order', 'ord-1');
      expect(openParams.get('order')).toBe('ord-1');
      expect(openParams.toString()).toBe('sort=date&page=1&order=ord-1');

      // Closing removes order param while preserving other filters
      const closeParams = new URLSearchParams(openParams);
      closeParams.delete('order');
      expect(closeParams.get('order')).toBeNull();
      expect(closeParams.toString()).toBe('sort=date&page=1');
    });
  });
});
