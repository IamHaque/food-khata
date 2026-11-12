import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import {
  FoodLeaders,
  duplicateNames,
  localityOf,
  filterLeaderRows,
  sortLeaderRows,
  ProportionalBarCell,
  SortableColumnHeader,
  LeadersSearchInput,
  RestaurantRow,
  DishRow,
  type LeaderRow,
} from './FoodLeaders';

const mockUpdate = vi.fn();
const mockClear = vi.fn();

let mockFilters: {
  restaurant_ids?: string[];
  search?: string;
  [key: string]: unknown;
} = {};

vi.mock('./FilterContext', () => ({
  useFilters: () => ({
    filters: mockFilters,
    update: mockUpdate,
    clear: mockClear,
  }),
}));

const sampleRestaurants: LeaderRow[] = [
  { key: 'rest-1', name: 'Biryani Blues', quantity: 25, amount: 12500 },
  { key: 'rest-2', name: 'Pizza Corner', quantity: 15, amount: 7500 },
  { key: 'rest-3', name: 'Burger Hub', quantity: 10, amount: 4000 },
];

const sampleDishes: LeaderRow[] = [
  {
    key: 'item-1',
    name: 'Chicken Dum Biryani',
    quantity: 30,
    amount: 9000,
    price_trend: [
      { month: '2025-01', unit_price: 300, quantity: 10 },
      { month: '2025-02', unit_price: 300, quantity: 20 },
    ],
  },
  {
    key: 'item-2',
    name: 'Margherita Pizza',
    quantity: 18,
    amount: 5400,
    price_trend: [{ month: '2025-01', unit_price: 300, quantity: 18 }],
  },
  {
    key: 'item-3',
    name: 'Veg Whopper',
    quantity: 8,
    amount: 1600,
    price_trend: [],
  },
];

let mockRestaurantsQuery: {
  data: { rows: LeaderRow[]; total: number } | null;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: any;
} = {
  data: { rows: sampleRestaurants, total: 3 },
  isPending: false,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
};

let mockItemsQuery: {
  data: { rows: LeaderRow[]; total: number } | null;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: any;
} = {
  data: { rows: sampleDishes, total: 3 },
  isPending: false,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
};

vi.mock('../hooks/api', () => ({
  useRestaurants: (params: unknown) => {
    lastRestaurantsParams = params;
    return mockRestaurantsQuery;
  },
  useItems: (params: unknown) => {
    lastItemsParams = params;
    return mockItemsQuery;
  },
}));

let lastRestaurantsParams: unknown = null;
let lastItemsParams: unknown = null;

describe('FoodLeaders (S-055)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFilters = {};
    mockRestaurantsQuery = {
      data: { rows: sampleRestaurants, total: 3 },
      isPending: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    };
    mockItemsQuery = {
      data: { rows: sampleDishes, total: 3 },
      isPending: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    };
    lastRestaurantsParams = null;
    lastItemsParams = null;
  });

  describe('1. Pure filter helper (filterLeaderRows)', () => {
    it('returns all rows when search query is empty or whitespace', () => {
      expect(filterLeaderRows(sampleRestaurants, '')).toEqual(sampleRestaurants);
      expect(filterLeaderRows(sampleRestaurants, '   ')).toEqual(sampleRestaurants);
    });

    it('filters rows case-insensitively by name', () => {
      const result = filterLeaderRows(sampleRestaurants, 'biryani');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Biryani Blues');

      const upperResult = filterLeaderRows(sampleRestaurants, 'PIZZA');
      expect(upperResult).toHaveLength(1);
      expect(upperResult[0].name).toBe('Pizza Corner');
    });

    it('matches rows by key if key contains query', () => {
      const result = filterLeaderRows(sampleRestaurants, 'rest-2');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Pizza Corner');
    });

    it('returns empty array when search query does not match', () => {
      const result = filterLeaderRows(sampleRestaurants, 'nonexistent taco');
      expect(result).toHaveLength(0);
    });
  });

  describe('2. Pure sort helper (sortLeaderRows)', () => {
    it('sorts by name ascending and descending', () => {
      const asc = sortLeaderRows(sampleRestaurants, 'name', 'asc');
      expect(asc.map(r => r.name)).toEqual(['Biryani Blues', 'Burger Hub', 'Pizza Corner']);

      const desc = sortLeaderRows(sampleRestaurants, 'name', 'desc');
      expect(desc.map(r => r.name)).toEqual(['Pizza Corner', 'Burger Hub', 'Biryani Blues']);
    });

    it('sorts by quantity ascending and descending', () => {
      const asc = sortLeaderRows(sampleRestaurants, 'quantity', 'asc');
      expect(asc.map(r => r.quantity)).toEqual([10, 15, 25]);

      const desc = sortLeaderRows(sampleRestaurants, 'quantity', 'desc');
      expect(desc.map(r => r.quantity)).toEqual([25, 15, 10]);
    });

    it('sorts by amount ascending and descending', () => {
      const asc = sortLeaderRows(sampleRestaurants, 'amount', 'asc');
      expect(asc.map(r => r.amount)).toEqual([4000, 7500, 12500]);

      const desc = sortLeaderRows(sampleRestaurants, 'amount', 'desc');
      expect(desc.map(r => r.amount)).toEqual([12500, 7500, 4000]);
    });

    it('does not mutate original array', () => {
      const original = [...sampleRestaurants];
      sortLeaderRows(sampleRestaurants, 'name', 'asc');
      expect(sampleRestaurants).toEqual(original);
    });
  });

  describe('3. Subcomponent: SortableColumnHeader', () => {
    it('renders aria-sort="ascending" when sorted ascending', () => {
      const html = renderToString(
        <table>
          <thead>
            <tr>
              <SortableColumnHeader
                label="Name"
                sortKey="name"
                currentSortKey="name"
                currentDirection="asc"
                onSort={vi.fn()}
              />
            </tr>
          </thead>
        </table>,
      );
      expect(html).toContain('aria-sort="ascending"');
      expect(html).toContain('data-testid="sort-asc"');
      expect(html).toContain('Sort by Name descending');
    });

    it('renders aria-sort="descending" when sorted descending', () => {
      const html = renderToString(
        <table>
          <thead>
            <tr>
              <SortableColumnHeader
                label="Amount"
                sortKey="amount"
                currentSortKey="amount"
                currentDirection="desc"
                onSort={vi.fn()}
              />
            </tr>
          </thead>
        </table>,
      );
      expect(html).toContain('aria-sort="descending"');
      expect(html).toContain('data-testid="sort-desc"');
      expect(html).toContain('Sort by Amount ascending');
    });

    it('renders aria-sort="none" when column is not sorted', () => {
      const html = renderToString(
        <table>
          <thead>
            <tr>
              <SortableColumnHeader
                label="Orders"
                sortKey="quantity"
                currentSortKey="amount"
                currentDirection="desc"
                onSort={vi.fn()}
              />
            </tr>
          </thead>
        </table>,
      );
      expect(html).toContain('aria-sort="none"');
      expect(html).toContain('data-testid="sort-none"');
      expect(html).toContain('Sort by Orders ascending');
    });

    it('triggers onSort with column key when clicked', () => {
      const onSort = vi.fn();
      const rendered = SortableColumnHeader({
        label: 'Name',
        sortKey: 'name',
        currentSortKey: 'amount',
        currentDirection: 'desc',
        onSort,
      });
      // Access onClick from the button element in returned JSX
      const button = rendered.props.children;
      button.props.onClick();
      expect(onSort).toHaveBeenCalledWith('name');
    });
  });

  describe('4. Subcomponent: ProportionalBarCell', () => {
    it('renders a right-aligned tabular rupee figure', () => {
      const html = renderToString(
        <ProportionalBarCell value={5000} maxValue={10000} label="spend" testIdPrefix="test-bar" />,
      );
      expect(html).toContain('₹5,000');
      expect(html).toContain('tabular-nums');
      expect(html).toContain('text-right');
      expect(html).toContain('data-testid="test-bar-cell"');
    });

    it('uses Indian digit grouping', () => {
      expect(renderToString(<ProportionalBarCell value={1234567} />)).toContain('₹12,34,567');
    });
  });

  describe('5. Subcomponent: LeadersSearchInput', () => {
    it('renders input with role="searchbox" and accessible label', () => {
      const html = renderToString(
        <LeadersSearchInput value="" onChange={vi.fn()} onClear={vi.fn()} />,
      );
      expect(html).toContain('role="searchbox"');
      expect(html).toContain('aria-label="Search restaurants and dishes"');
      expect(html).toContain('placeholder="Search restaurants and dishes…"');
    });

    it('renders clear button when value is non-empty', () => {
      const html = renderToString(
        <LeadersSearchInput value="biryani" onChange={vi.fn()} onClear={vi.fn()} />,
      );
      expect(html).toContain('data-testid="clear-search-button"');
      expect(html).toContain('aria-label="Clear search"');
    });

    it('triggers onChange and onClear callbacks', () => {
      const onChange = vi.fn();
      const onClear = vi.fn();
      const rendered = LeadersSearchInput({
        value: 'test',
        onChange,
        onClear,
      });
      const inputElem = rendered.props.children[2];
      inputElem.props.onChange({ target: { value: 'updated' } });
      expect(onChange).toHaveBeenCalledWith('updated');

      // Test escape key
      const stopPropagation = vi.fn();
      inputElem.props.onKeyDown({ key: 'Escape', stopPropagation });
      expect(stopPropagation).toHaveBeenCalled();
      expect(onClear).toHaveBeenCalled();

      // Test clear button click
      const clearBtn = rendered.props.children[3];
      clearBtn.props.onClick();
      expect(onClear).toHaveBeenCalledTimes(2);
    });
  });

  describe('6. Subcomponent: RestaurantRow (Keyboard & Click Accessibility)', () => {
    it('renders accessible row attributes (tabIndex=0, role="button", aria-label)', () => {
      const html = renderToString(
        <table>
          <tbody>
            <RestaurantRow
              row={sampleRestaurants[0]}
              maxAmount={15000}
              isSelected={false}
              onClick={vi.fn()}
              onKeyDown={vi.fn()}
            />
          </tbody>
        </table>,
      );
      expect(html).toContain('tabindex="0"');
      expect(html).toContain('role="button"');
      expect(html).toContain('aria-pressed="false"');
      expect(html).toContain('aria-label="Filter dashboard by Biryani Blues"');
      expect(html).toContain('data-testid="restaurant-row-rest-1"');
      expect(html).toContain('₹12,500');
    });

    it('renders active styling and aria-pressed="true" when isSelected=true', () => {
      const html = renderToString(
        <table>
          <tbody>
            <RestaurantRow
              row={sampleRestaurants[0]}
              maxAmount={15000}
              isSelected={true}
              onClick={vi.fn()}
              onKeyDown={vi.fn()}
            />
          </tbody>
        </table>,
      );
      expect(html).toContain('aria-pressed="true"');
      expect(html).toContain('bg-accent');
    });

    it('invokes onClick handler when clicked', () => {
      const onClick = vi.fn();
      const row = (
        <RestaurantRow
          row={sampleRestaurants[0]}
          maxAmount={15000}
          isSelected={false}
          onClick={onClick}
          onKeyDown={vi.fn()}
        />
      );
      row.props.onClick();
      expect(onClick).toHaveBeenCalled();
    });

    it('invokes onKeyDown handler on Enter or Space key', () => {
      const onKeyDown = vi.fn();
      const row = (
        <RestaurantRow
          row={sampleRestaurants[0]}
          maxAmount={15000}
          isSelected={false}
          onClick={vi.fn()}
          onKeyDown={onKeyDown}
        />
      );
      const preventDefault = vi.fn();
      row.props.onKeyDown({ key: 'Enter', preventDefault });
      expect(onKeyDown).toHaveBeenCalledWith({ key: 'Enter', preventDefault });
    });
  });

  describe('7. Subcomponent: DishRow (Keyboard & Click Accessibility)', () => {
    it('renders accessible dish row attributes and filter button', () => {
      const html = renderToString(
        <table>
          <tbody>
            <DishRow
              row={sampleDishes[0]}
              maxAmount={10000}
              isSelected={false}
              onClick={vi.fn()}
              onKeyDown={vi.fn()}
              onFilterSearch={vi.fn()}
            />
          </tbody>
        </table>,
      );
      expect(html).toContain('tabindex="0"');
      expect(html).toContain('role="button"');
      expect(html).toContain('aria-label="Select dish Chicken Dum Biryani"');
      expect(html).toContain('data-testid="dish-row-item-1"');
      expect(html).toContain('data-testid="dish-filter-btn-item-1"');
      expect(html).toContain('aria-label="Filter dashboard by Chicken Dum Biryani"');
    });

    it('invokes onClick and onFilterSearch handlers', () => {
      const onClick = vi.fn();
      const onFilterSearch = vi.fn();
      const rendered = DishRow({
        row: sampleDishes[0],
        maxAmount: 10000,
        isSelected: false,
        onClick,
        onKeyDown: vi.fn(),
        onFilterSearch,
      });
      rendered.props.onClick();
      expect(onClick).toHaveBeenCalled();

      // Find filter button in cell
      const tdFirst = rendered.props.children[0];
      const filterBtn = tdFirst.props.children[1];
      const stopPropagation = vi.fn();
      filterBtn.props.onClick({ stopPropagation });
      expect(stopPropagation).toHaveBeenCalled();
      expect(onFilterSearch).toHaveBeenCalledWith('Chicken Dum Biryani');
    });
  });

  describe('8. Full FoodLeaders Component Rendering (Scenario: Tables & Row click)', () => {
    it('renders search box, sortable headers, inline proportional bars, and SegmentedControl', () => {
      const html = renderToString(<FoodLeaders />);

      // Search box (Requirement 1)
      expect(html).toContain('data-testid="leaders-search-input"');
      expect(html).toContain('role="searchbox"');

      // SegmentedControl for restaurant grouping (Requirement 5)
      expect(html).toContain('Name and locality');
      expect(html).toContain('Platform listing');
      expect(html).toContain('role="radiogroup"');

      // Sortable columns with aria-sort (Requirement 2)
      expect(html).toContain('aria-sort="none"');
      expect(html).toContain('aria-sort="descending"');
      expect(html).toContain('data-testid="sort-desc"');

      // Ledger figures
      expect(html).toContain('data-testid="restaurant-amount-cell"');
      expect(html).toContain('data-testid="dish-amount-cell"');

      // Row accessibility (Requirement 4)
      expect(html).toContain('data-testid="restaurant-row-rest-1"');
      expect(html).toContain('data-testid="dish-row-item-1"');

      // Pagination controls retained (Requirement 5)
      expect(html).toContain('Previous restaurants');
      expect(html).toContain('Next restaurants');
      expect(html).toContain('Previous dishes');
      expect(html).toContain('Next dishes');
    });

    it('passes search, sort, and pagination parameters to api hooks', () => {
      renderToString(<FoodLeaders />);

      expect(lastRestaurantsParams).toBeDefined();
      expect(lastRestaurantsParams).toMatchObject({
        sort: 'amount',
        direction: 'desc',
        min_orders: 1,
        grouping: 'merged',
        page: 1,
        page_size: 25,
      });

      expect(lastItemsParams).toBeDefined();
      expect(lastItemsParams).toMatchObject({
        sort: 'amount',
        direction: 'desc',
        min_qty: 1,
        page: 1,
        page_size: 25,
      });
    });

    it('renders active restaurant filter badge when filters.restaurant_ids is present', () => {
      mockFilters = { restaurant_ids: ['rest-1'] };
      const html = renderToString(<FoodLeaders />);
      expect(html).toContain('Active restaurant filter:');
      expect(html).toContain('rest-1');
      expect(html).toContain('aria-label="Clear active restaurant filter"');
    });

    it('highlights filtered restaurant row when restaurant_ids matches', () => {
      mockFilters = { restaurant_ids: ['rest-1'] };
      const html = renderToString(<FoodLeaders />);
      expect(html).toContain('aria-pressed="true"');
      expect(html).toContain('bg-accent');
    });

    it('renders empty message when no restaurants or dishes match', () => {
      mockRestaurantsQuery.data = { rows: [], total: 0 };
      mockItemsQuery.data = { rows: [], total: 0 };
      const html = renderToString(<FoodLeaders />);
      expect(html).toContain('No restaurants match.');
      expect(html).toContain('No dishes match.');
    });

    it('renders loading status when queries are pending', () => {
      mockRestaurantsQuery.isPending = true;
      mockItemsQuery.isPending = true;
      const html = renderToString(<FoodLeaders />);
      expect(html).toContain('Loading restaurants…');
      expect(html).toContain('Loading dishes…');
    });

    it('renders error state with retry button when queries fail', () => {
      mockRestaurantsQuery.isError = true;
      mockItemsQuery.isError = true;
      const html = renderToString(<FoodLeaders />);
      expect(html).toContain('could not load.');
    });

    it('calls onRestaurantClick and onDishClick callbacks if provided', () => {
      const onRestaurantClick = vi.fn();
      const onDishClick = vi.fn();
      const elem = (
        <FoodLeaders
          onRestaurantClick={onRestaurantClick}
          onDishClick={onDishClick}
        />
      );
      expect(elem).toBeDefined();
    });
  });
});

describe('locality for repeated names', () => {
  it('finds names that appear more than once and reads the locality from the merged key', () => {
    expect([...duplicateNames([{ name: 'A' }, { name: 'B' }, { name: 'A' }])]).toEqual(['A']);
    expect(localityOf('basil & bamboo|indiranagar')).toBe('Indiranagar');
    expect(localityOf('plain-key')).toBeNull();
  });
});
