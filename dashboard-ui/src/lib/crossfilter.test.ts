import { describe, expect, it, beforeEach } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { defaultFilters, type FilterState } from './filters';
import {
  DECLARATIVE_MAPPINGS,
  mapElementToPatch,
  declareChartMapping,
  hourToMealSlot,
  weekdayToDayType,
  monthToDateRange,
  parseMealSlot,
  crossFilter,
  pushCrossFilterHistory,
  popCrossFilterHistory,
  peekCrossFilterHistory,
  clearCrossFilterHistory,
  getCrossFilterHistory,
  canUndoCrossFilter,
  type CrossFilterDimension,
} from './crossfilter';
import { FilterProvider, useFilters, handleCrossFilterEscape } from '../app/FilterContext';
import { Providers } from '../app/providers';

describe('crossfilter engine (S-020)', () => {
  beforeEach(() => {
    clearCrossFilterHistory();
  });

  describe('Scenario: Mapping is declarative', () => {
    const expectedDimensions: CrossFilterDimension[] = [
      'platform',
      'restaurant',
      'cuisine',
      'month',
      'weekday',
      'hour',
      'meal_slot',
    ];

    it('covers every mapping dimension declaratively', () => {
      for (const dim of expectedDimensions) {
        expect(DECLARATIVE_MAPPINGS[dim]).toBeDefined();
        expect(DECLARATIVE_MAPPINGS[dim].dimension).toBe(dim);
        expect(DECLARATIVE_MAPPINGS[dim].targetFields.length).toBeGreaterThan(0);
        expect(typeof DECLARATIVE_MAPPINGS[dim].toPatch).toBe('function');
      }
    });

    it('maps platform element to FilterState patch', () => {
      const patch = mapElementToPatch('platform', 'SWIGGY');
      expect(patch).toEqual({ platforms: ['SWIGGY'] });
    });

    it('maps restaurant element to FilterState patch', () => {
      const patch = mapElementToPatch('restaurant', 'rest_123');
      expect(patch).toEqual({ restaurant_ids: ['rest_123'] });
    });

    it('maps cuisine element to FilterState patch', () => {
      const patch = mapElementToPatch('cuisine', 'Mughlai');
      expect(patch).toEqual({ cuisines: ['Mughlai'] });
    });

    it('maps meal_slot element to FilterState patch', () => {
      expect(mapElementToPatch('meal_slot', 'dinner')).toEqual({ meal_slots: ['dinner'] });
      expect(mapElementToPatch('meal_slot', 'Late Night')).toEqual({ meal_slots: ['late_night'] });
    });

    it('maps hour element to corresponding meal_slots patch', () => {
      expect(mapElementToPatch('hour', '6')).toEqual({ meal_slots: ['breakfast'] });
      expect(mapElementToPatch('hour', '12')).toEqual({ meal_slots: ['lunch'] });
      expect(mapElementToPatch('hour', '16')).toEqual({ meal_slots: ['snack'] });
      expect(mapElementToPatch('hour', '20')).toEqual({ meal_slots: ['dinner'] });
      expect(mapElementToPatch('hour', '23')).toEqual({ meal_slots: ['late_night'] });
      expect(mapElementToPatch('hour', '2')).toEqual({ meal_slots: ['late_night'] });
      expect(mapElementToPatch('hour', '2pm')).toEqual({ meal_slots: ['lunch'] });
    });

    it('maps weekday element to day_type patch', () => {
      expect(mapElementToPatch('weekday', 'Monday')).toEqual({ day_type: 'weekday' });
      expect(mapElementToPatch('weekday', 'weekday')).toEqual({ day_type: 'weekday' });
      expect(mapElementToPatch('weekday', 'Saturday')).toEqual({ day_type: 'weekend' });
      expect(mapElementToPatch('weekday', 'sun')).toEqual({ day_type: 'weekend' });
      expect(mapElementToPatch('weekday', 'weekend')).toEqual({ day_type: 'weekend' });
    });

    it('maps month element to calendar date range bounds', () => {
      expect(mapElementToPatch('month', '2025-01')).toEqual({
        date_from: '2025-01-01',
        date_to: '2025-01-31',
      });
      // Leap year check: Feb 2024 has 29 days
      expect(mapElementToPatch('month', '2024-02')).toEqual({
        date_from: '2024-02-01',
        date_to: '2024-02-29',
      });
      // Non-leap year check: Feb 2025 has 28 days
      expect(mapElementToPatch('month', '2025-02')).toEqual({
        date_from: '2025-02-01',
        date_to: '2025-02-28',
      });
    });

    it('allows charts to declare a declarative mapping or custom override', () => {
      const defaultPlatformMapping = declareChartMapping('platform');
      expect(defaultPlatformMapping('zomato')).toEqual({ platforms: ['zomato'] });

      const customMapping = declareChartMapping('platform', val => ({
        platforms: [val.toUpperCase()],
      }));
      expect(customMapping('zomato')).toEqual({ platforms: ['ZOMATO'] });
    });
  });

  describe('Scenario: Click to filter (Single-click)', () => {
    it('sets single platform selection from empty', () => {
      const initial = defaultFilters();
      const updated = crossFilter(initial, 'platform', 'swiggy', false);
      expect(updated.platforms).toEqual(['swiggy']);
    });

    it('replaces different single platform selection', () => {
      const initial: FilterState = { ...defaultFilters(), platforms: ['zomato'] };
      const updated = crossFilter(initial, 'platform', 'swiggy', false);
      expect(updated.platforms).toEqual(['swiggy']);
    });

    it('replaces multi-selection with single clicked platform', () => {
      const initial: FilterState = { ...defaultFilters(), platforms: ['zomato', 'eatsure'] };
      const updated = crossFilter(initial, 'platform', 'swiggy', false);
      expect(updated.platforms).toEqual(['swiggy']);
    });

    it('sets single restaurant selection', () => {
      const initial = defaultFilters();
      const updated = crossFilter(initial, 'restaurant', 'r_100', false);
      expect(updated.restaurant_ids).toEqual(['r_100']);
    });

    it('sets single cuisine selection', () => {
      const initial = defaultFilters();
      const updated = crossFilter(initial, 'cuisine', 'Biryani', false);
      expect(updated.cuisines).toEqual(['Biryani']);
    });

    it('sets single meal_slot selection', () => {
      const initial = defaultFilters();
      const updated = crossFilter(initial, 'meal_slot', 'lunch', false);
      expect(updated.meal_slots).toEqual(['lunch']);
    });

    it('sets meal_slots from hour element click', () => {
      const initial = defaultFilters();
      const updated = crossFilter(initial, 'hour', '19', false);
      expect(updated.meal_slots).toEqual(['dinner']);
    });

    it('sets day_type from weekday element click', () => {
      const initial = defaultFilters();
      const updated = crossFilter(initial, 'weekday', 'Friday', false);
      expect(updated.day_type).toBe('weekday');
    });

    it('sets calendar month date range from month element click', () => {
      const initial = defaultFilters();
      const updated = crossFilter(initial, 'month', '2025-07', false);
      expect(updated.date_from).toBe('2025-07-01');
      expect(updated.date_to).toBe('2025-07-31');
    });
  });

  describe('Scenario: Multi-select and toggle', () => {
    it('Shift-click adds element to array if missing', () => {
      const initial: FilterState = { ...defaultFilters(), platforms: ['swiggy'] };
      const updated = crossFilter(initial, 'platform', 'zomato', true);
      expect(updated.platforms).toEqual(['swiggy', 'zomato']);
    });

    it('Shift-click removes element from array if present', () => {
      const initial: FilterState = { ...defaultFilters(), platforms: ['swiggy', 'zomato'] };
      const updated = crossFilter(initial, 'platform', 'swiggy', true);
      expect(updated.platforms).toEqual(['zomato']);
    });

    it('Shift-click on restaurant adds and removes', () => {
      const f1 = crossFilter(defaultFilters(), 'restaurant', 'r1', true);
      expect(f1.restaurant_ids).toEqual(['r1']);
      const f2 = crossFilter(f1, 'restaurant', 'r2', true);
      expect(f2.restaurant_ids).toEqual(['r1', 'r2']);
      const f3 = crossFilter(f2, 'restaurant', 'r1', true);
      expect(f3.restaurant_ids).toEqual(['r2']);
    });

    it('Shift-click on cuisine adds and removes', () => {
      const f1 = crossFilter(defaultFilters(), 'cuisine', 'North Indian', true);
      expect(f1.cuisines).toEqual(['North Indian']);
      const f2 = crossFilter(f1, 'cuisine', 'Chinese', true);
      expect(f2.cuisines).toEqual(['North Indian', 'Chinese']);
      const f3 = crossFilter(f2, 'cuisine', 'North Indian', true);
      expect(f3.cuisines).toEqual(['Chinese']);
    });

    it('Shift-click on hour adds and removes mapped meal_slot', () => {
      const f1 = crossFilter(defaultFilters(), 'hour', '12', true); // lunch
      expect(f1.meal_slots).toEqual(['lunch']);
      const f2 = crossFilter(f1, 'hour', '20', true); // dinner
      expect(f2.meal_slots).toEqual(['lunch', 'dinner']);
      const f3 = crossFilter(f2, 'hour', '13', true); // lunch again -> remove
      expect(f3.meal_slots).toEqual(['dinner']);
    });

    it('Shift-click on weekday toggles day_type properly', () => {
      const f1 = crossFilter(defaultFilters(), 'weekday', 'Saturday', true);
      expect(f1.day_type).toBe('weekend');
      const f2 = crossFilter(f1, 'weekday', 'Saturday', true);
      expect(f2.day_type).toBe('all');
    });

    it('Shift-click on month expands the date range bounds', () => {
      const f1 = crossFilter(defaultFilters(), 'month', '2025-01', true);
      expect(f1.date_from).toBe('2025-01-01');
      expect(f1.date_to).toBe('2025-01-31');

      const f2 = crossFilter(f1, 'month', '2025-03', true);
      expect(f2.date_from).toBe('2025-01-01');
      expect(f2.date_to).toBe('2025-03-31');

      // Toggling the exact same month range removes it
      const f3 = crossFilter(defaultFilters(), 'month', '2025-01', false);
      const f4 = crossFilter(f3, 'month', '2025-01', true);
      expect(f4.date_from).toBeNull();
      expect(f4.date_to).toBeNull();
    });

    it('single click toggles selected element off when already selected alone', () => {
      // Platform toggle
      const p1: FilterState = { ...defaultFilters(), platforms: ['swiggy'] };
      expect(crossFilter(p1, 'platform', 'swiggy', false).platforms).toEqual([]);

      // Restaurant toggle
      const r1: FilterState = { ...defaultFilters(), restaurant_ids: ['rest_1'] };
      expect(crossFilter(r1, 'restaurant', 'rest_1', false).restaurant_ids).toEqual([]);

      // Cuisine toggle
      const c1: FilterState = { ...defaultFilters(), cuisines: ['Italian'] };
      expect(crossFilter(c1, 'cuisine', 'Italian', false).cuisines).toEqual([]);

      // Meal slot toggle
      const m1: FilterState = { ...defaultFilters(), meal_slots: ['dinner'] };
      expect(crossFilter(m1, 'meal_slot', 'dinner', false).meal_slots).toEqual([]);

      // Weekday toggle
      const w1: FilterState = { ...defaultFilters(), day_type: 'weekday' };
      expect(crossFilter(w1, 'weekday', 'Monday', false).day_type).toBe('all');

      // Month toggle
      const d1: FilterState = { ...defaultFilters(), date_from: '2025-04-01', date_to: '2025-04-30' };
      const dCleared = crossFilter(d1, 'month', '2025-04', false);
      expect(dCleared.date_from).toBeNull();
      expect(dCleared.date_to).toBeNull();
    });
  });

  describe('Scenario: Undo (Stack & History)', () => {
    it('manages undo stack in LIFO order', () => {
      const state0 = defaultFilters();
      const state1 = crossFilter(state0, 'platform', 'swiggy', false);
      const state2 = crossFilter(state1, 'cuisine', 'Biryani', false);

      expect(canUndoCrossFilter()).toBe(false);

      pushCrossFilterHistory(state0);
      expect(canUndoCrossFilter()).toBe(true);
      expect(peekCrossFilterHistory()?.platforms).toEqual([]);

      pushCrossFilterHistory(state1);
      expect(getCrossFilterHistory().length).toBe(2);

      const popped1 = popCrossFilterHistory();
      expect(popped1?.platforms).toEqual(['swiggy']);
      expect(popped1?.cuisines).toEqual([]);

      const popped0 = popCrossFilterHistory();
      expect(popped0?.platforms).toEqual([]);

      expect(popCrossFilterHistory()).toBeUndefined();
      expect(canUndoCrossFilter()).toBe(false);
    });

    it('clearCrossFilterHistory empties the history stack', () => {
      pushCrossFilterHistory(defaultFilters());
      pushCrossFilterHistory({ ...defaultFilters(), platforms: ['zomato'] });
      expect(canUndoCrossFilter()).toBe(true);

      clearCrossFilterHistory();
      expect(canUndoCrossFilter()).toBe(false);
      expect(popCrossFilterHistory()).toBeUndefined();
    });
  });

  describe('Integration with FilterContext', () => {
    it('provides applyCrossFilter and undoCrossFilter in FilterContext', () => {
      let contextValue: ReturnType<typeof useFilters> | null = null;

      function TestConsumer() {
        contextValue = useFilters();
        return React.createElement('div', null, 'Filters Consumer');
      }

      renderToString(
        React.createElement(
          Providers,
          null,
          React.createElement(
            MemoryRouter,
            { initialEntries: ['/'] },
            React.createElement(FilterProvider, null, React.createElement(TestConsumer, null))
          )
        )
      );

      expect(contextValue).not.toBeNull();
      expect(typeof contextValue!.applyCrossFilter).toBe('function');
      expect(typeof contextValue!.undoCrossFilter).toBe('function');
    });

    it('applies cross filter and captures prior state in history', () => {
      let capturedContext: ReturnType<typeof useFilters> | null = null;

      function TestComponent() {
        capturedContext = useFilters();
        return React.createElement('div', null, 'Test Component');
      }

      renderToString(
        React.createElement(
          Providers,
          null,
          React.createElement(
            MemoryRouter,
            { initialEntries: ['/'] },
            React.createElement(FilterProvider, null, React.createElement(TestComponent, null))
          )
        )
      );

      expect(capturedContext).not.toBeNull();
      expect(canUndoCrossFilter()).toBe(false);

      // Apply cross filter via FilterContext
      capturedContext!.applyCrossFilter('platform', 'swiggy');
      expect(canUndoCrossFilter()).toBe(true);
      expect(peekCrossFilterHistory()?.platforms).toEqual([]);

      // Calling undoCrossFilter reverts history
      const undid = capturedContext!.undoCrossFilter();
      expect(undid).toBe(true);
      expect(canUndoCrossFilter()).toBe(false);
    });

    it('handles global Escape key via handleCrossFilterEscape', () => {
      // 1. When no history exists: does not handle Escape
      clearCrossFilterHistory();
      let prevented = false;
      let undoCalled = false;
      const fakeUndo = () => {
        undoCalled = true;
        return true;
      };

      const res1 = handleCrossFilterEscape(
        { key: 'Escape', defaultPrevented: false, preventDefault: () => { prevented = true; } },
        fakeUndo,
        { querySelector: () => null }
      );
      expect(res1).toBe(false);
      expect(prevented).toBe(false);
      expect(undoCalled).toBe(false);

      // 2. When history exists: handles Escape and calls preventDefault & undo
      pushCrossFilterHistory(defaultFilters());
      expect(canUndoCrossFilter()).toBe(true);

      const res2 = handleCrossFilterEscape(
        { key: 'Escape', defaultPrevented: false, preventDefault: () => { prevented = true; } },
        fakeUndo,
        { querySelector: () => null }
      );
      expect(res2).toBe(true);
      expect(prevented).toBe(true);
      expect(undoCalled).toBe(true);

      // 3. When an open dialog or modal is present: does NOT undo
      pushCrossFilterHistory(defaultFilters());
      prevented = false;
      undoCalled = false;
      const res3 = handleCrossFilterEscape(
        { key: 'Escape', defaultPrevented: false, preventDefault: () => { prevented = true; } },
        fakeUndo,
        { querySelector: (sel: string) => (sel.includes('dialog') ? {} : null) }
      );
      expect(res3).toBe(false);
      expect(prevented).toBe(false);
      expect(undoCalled).toBe(false);

      // 4. When event was already defaultPrevented: does NOT undo
      prevented = false;
      undoCalled = false;
      const res4 = handleCrossFilterEscape(
        { key: 'Escape', defaultPrevented: true, preventDefault: () => { prevented = true; } },
        fakeUndo,
        { querySelector: () => null }
      );
      expect(res4).toBe(false);
      expect(undoCalled).toBe(false);

      // 5. When key is not Escape: does NOT undo
      const res5 = handleCrossFilterEscape(
        { key: 'Enter', defaultPrevented: false, preventDefault: () => { prevented = true; } },
        fakeUndo,
        { querySelector: () => null }
      );
      expect(res5).toBe(false);
      expect(undoCalled).toBe(false);
    });
  });
});
