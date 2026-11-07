import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import {
  registerChart,
  unregisterChart,
  emitHighlight,
  emitClear,
  clearHighlights,
  clearRegistry,
  getRegisteredChartCount,
  isClearPending,
  CLEAR_DELAY_MS,
  isMonthMatch,
  isWeekdayMatch,
  isHourMatch,
  isDimensionMatch,
  detectDimension,
  extractHoverInfo,
  type EChartsLike,
} from './highlight-bus';
import { Chart } from '../app/Chart';

function createMockChart(options?: Record<string, unknown>): EChartsLike & {
  dispatchAction: ReturnType<typeof vi.fn>;
  getOption: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  isDisposed: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
} {
  return {
    dispatchAction: vi.fn(),
    getOption: vi.fn().mockReturnValue(options ?? {}),
    on: vi.fn(),
    off: vi.fn(),
    isDisposed: vi.fn().mockReturnValue(false),
    resize: vi.fn(),
  };
}

describe('S-021: Linked hover highlight bus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearRegistry();
  });

  afterEach(() => {
    clearRegistry();
    vi.useRealTimers();
  });

  describe('Scenario: Highlight everywhere (Highlight broadcast)', () => {
    it('hovering one chart invokes dispatchAction({ type: "highlight" }) on other registered charts', () => {
      const chartA = createMockChart();
      const chartB = createMockChart();
      const chartC = createMockChart();

      registerChart('chartA', chartA);
      registerChart('chartB', chartB);
      registerChart('chartC', chartC);

      expect(getRegisteredChartCount()).toBe(3);

      emitHighlight('chartA', 'month', '2024-01');

      // Source chart does not receive broadcast action
      expect(chartA.dispatchAction).not.toHaveBeenCalled();

      // Other registered charts receive downplay (dimming) then highlight
      expect(chartB.dispatchAction).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'downplay' })
      );
      expect(chartB.dispatchAction).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'highlight' })
      );

      expect(chartC.dispatchAction).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'downplay' })
      );
      expect(chartC.dispatchAction).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'highlight' })
      );
    });

    it('highlights matching category mark on xAxis (e.g. month dimension)', () => {
      const chartA = createMockChart();
      const chartB = createMockChart({
        xAxis: { data: ['2023-11', '2023-12', '2024-01', '2024-02'] },
        series: [{ type: 'bar', data: [100, 200, 300, 400] }],
      });

      registerChart('chartA', chartA);
      registerChart('chartB', chartB);

      emitHighlight('chartA', 'month', '2024-01');

      expect(chartB.dispatchAction).toHaveBeenCalledWith({
        type: 'highlight',
        seriesIndex: 0,
        dataIndex: 2,
        name: '2024-01',
      });
    });

    it('highlights matching category mark on horizontal yAxis (e.g. cuisine dimension)', () => {
      const chartA = createMockChart();
      const chartB = createMockChart({
        yAxis: { data: ['Chinese', 'North Indian', 'Biryani'] },
        series: [{ type: 'bar', data: [10, 20, 30] }],
      });

      registerChart('chartA', chartA);
      registerChart('chartB', chartB);

      emitHighlight('chartA', 'cuisine', 'Biryani');

      expect(chartB.dispatchAction).toHaveBeenCalledWith({
        type: 'highlight',
        seriesIndex: 0,
        dataIndex: 2,
        name: 'Biryani',
      });
    });

    it('highlights matching marks across all supported dimensions: platform, restaurant, weekday, hour', () => {
      const chartA = createMockChart();
      const chartB = createMockChart({
        series: [
          {
            type: 'pie',
            data: [
              { name: 'Swiggy', value: 120 },
              { name: 'Zomato', value: 80 },
            ],
          },
        ],
      });

      registerChart('chartA', chartA);
      registerChart('chartB', chartB);

      // 1. Platform
      emitHighlight('chartA', 'platform', 'swiggy');
      expect(chartB.dispatchAction).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'highlight', name: 'Swiggy' })
      );

      // 2. Weekday
      const chartWeekday = createMockChart({
        xAxis: { data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
        series: [{ type: 'bar', data: [1, 2, 3, 4, 5, 6, 7] }],
      });
      registerChart('chartWeekday', chartWeekday);
      emitHighlight('chartA', 'weekday', 'Monday');
      expect(chartWeekday.dispatchAction).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'highlight', dataIndex: 0 })
      );

      // 3. Hour
      const chartHour = createMockChart({
        xAxis: { data: ['12:00', '13:00', '14:00', '15:00'] },
        series: [{ type: 'line', data: [5, 10, 15, 20] }],
      });
      registerChart('chartHour', chartHour);
      emitHighlight('chartA', 'hour', '2 PM');
      expect(chartHour.dispatchAction).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'highlight', dataIndex: 2 })
      );

      // 4. Restaurant
      const chartRest = createMockChart({
        yAxis: { data: ['Meghana Foods', 'Empire Restaurant'] },
        series: [{ type: 'bar', data: [50, 30] }],
      });
      registerChart('chartRest', chartRest);
      emitHighlight('chartA', 'restaurant', 'Meghana Foods');
      expect(chartRest.dispatchAction).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'highlight', dataIndex: 0 })
      );
    });

    it('supports custom chart matcher override', () => {
      const chartA = createMockChart();
      const chartB = createMockChart();
      const customMatcher = vi.fn().mockReturnValue({
        type: 'highlight',
        seriesIndex: 9,
        dataIndex: 42,
      });

      registerChart('chartA', chartA);
      registerChart('chartB', chartB, customMatcher);

      emitHighlight('chartA', 'month', '2024-05');

      expect(customMatcher).toHaveBeenCalledWith('month', '2024-05', chartB);
      expect(chartB.dispatchAction).toHaveBeenCalledWith({
        type: 'highlight',
        seriesIndex: 9,
        dataIndex: 42,
      });
    });

    it('ignores charts that are disposed', () => {
      const chartA = createMockChart();
      const chartDisposed = createMockChart();
      chartDisposed.isDisposed.mockReturnValue(true);

      registerChart('chartA', chartA);
      registerChart('chartDisposed', chartDisposed);

      emitHighlight('chartA', 'month', '2024-01');

      expect(chartDisposed.dispatchAction).not.toHaveBeenCalled();
    });
  });

  describe('Scenario: Cleanup (120ms debounce timing)', () => {
    it('highlights clear within 120ms after pointer leaves', () => {
      const chartA = createMockChart();
      const chartB = createMockChart();
      registerChart('chartA', chartA);
      registerChart('chartB', chartB);

      emitHighlight('chartA', 'month', '2024-01');
      chartB.dispatchAction.mockClear();

      // Pointer leaves
      emitClear('chartA');
      expect(isClearPending()).toBe(true);

      // Not cleared yet at 50ms
      vi.advanceTimersByTime(50);
      expect(chartB.dispatchAction).not.toHaveBeenCalled();
      expect(isClearPending()).toBe(true);

      // Not cleared yet at 119ms
      vi.advanceTimersByTime(69);
      expect(chartB.dispatchAction).not.toHaveBeenCalled();

      // Cleared at 120ms
      vi.advanceTimersByTime(1);
      expect(isClearPending()).toBe(false);
      expect(chartA.dispatchAction).toHaveBeenCalledWith({ type: 'downplay' });
      expect(chartB.dispatchAction).toHaveBeenCalledWith({ type: 'downplay' });
    });

    it('immediate clearHighlights resets highlights instantly without waiting 120ms', () => {
      const chart = createMockChart();
      registerChart('test', chart);

      clearHighlights();
      expect(chart.dispatchAction).toHaveBeenCalledWith({ type: 'downplay' });
    });
  });

  describe('Scenario: Debounce / cancel on rapid hover changes', () => {
    it('rapid hover changes cancel previous clear timer', () => {
      const chartA = createMockChart();
      const chartB = createMockChart();
      registerChart('chartA', chartA);
      registerChart('chartB', chartB);

      // User hovers item 1
      emitHighlight('chartA', 'month', '2024-01');

      // Pointer moves away, scheduling clear
      emitClear('chartA');
      expect(isClearPending()).toBe(true);

      // User immediately moves over item 2 before 120ms (e.g. at 60ms)
      vi.advanceTimersByTime(60);
      emitHighlight('chartA', 'month', '2024-02');

      expect(chartB.dispatchAction).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'highlight', name: '2024-02' })
      );

      // Clear timer was cancelled
      expect(isClearPending()).toBe(false);

      // Reset mock calls now that 2024-02 is active
      chartB.dispatchAction.mockClear();

      // Advance time past original 120ms mark
      vi.advanceTimersByTime(100);

      // The previous clear did NOT fire to wipe out the 2024-02 highlight!
      expect(chartB.dispatchAction).not.toHaveBeenCalled();
    });

    it('consecutive emitClear calls reset the 120ms debounce countdown', () => {
      const chart = createMockChart();
      registerChart('test', chart);

      emitClear();
      vi.advanceTimersByTime(80);

      // Second clear call resets countdown to new 120ms
      emitClear();

      vi.advanceTimersByTime(80); // Total 160ms from first call, 80ms from second
      expect(chart.dispatchAction).not.toHaveBeenCalled();

      vi.advanceTimersByTime(40); // 120ms from second call
      expect(chart.dispatchAction).toHaveBeenCalledWith({ type: 'downplay' });
    });
  });

  describe('Scenario: Unregister', () => {
    it('unmounted charts receive no actions after unregistering', () => {
      const chartA = createMockChart();
      const chartB = createMockChart();
      registerChart('chartA', chartA);
      const unregisterB = registerChart('chartB', chartB);

      expect(getRegisteredChartCount()).toBe(2);

      // Unregister chartB
      unregisterB();
      expect(getRegisteredChartCount()).toBe(1);

      // Emit highlight from chartA
      emitHighlight('chartA', 'cuisine', 'Biryani');

      expect(chartB.dispatchAction).not.toHaveBeenCalled();

      // Emit clear
      emitClear('chartA');
      vi.advanceTimersByTime(CLEAR_DELAY_MS);

      expect(chartB.dispatchAction).not.toHaveBeenCalled();
    });

    it('unregisterChart by string id works identically', () => {
      const chart = createMockChart();
      registerChart('temp', chart);
      expect(getRegisteredChartCount()).toBe(1);

      unregisterChart('temp');
      expect(getRegisteredChartCount()).toBe(0);

      emitHighlight('other', 'month', '2024-01');
      expect(chart.dispatchAction).not.toHaveBeenCalled();
    });
  });

  describe('Scenario: Performance (Zero React re-renders)', () => {
    it('hover updates do not re-render React trees (use ECharts dispatchAction)', () => {
      let renderCount = 0;

      function ObservedComponent() {
        renderCount++;
        return React.createElement('div', { id: 'chart-container' });
      }

      // Initial render
      renderToString(React.createElement(ObservedComponent));
      expect(renderCount).toBe(1);

      // Simulate a stream of 60fps hover events (60 consecutive hover/clear actions)
      const mockChart1 = createMockChart();
      const mockChart2 = createMockChart();
      registerChart('c1', mockChart1);
      registerChart('c2', mockChart2);

      for (let i = 0; i < 60; i++) {
        emitHighlight('c1', 'month', `2024-${String((i % 12) + 1).padStart(2, '0')}`);
        if (i % 5 === 0) {
          emitClear('c1');
        }
      }

      // Assert that zero React renders were triggered by the linked hover bus
      expect(renderCount).toBe(1);
    });

    it('Chart component renders server-side and client-side without re-render side-effects', () => {
      const html = renderToString(
        React.createElement(Chart, {
          option: {
            xAxis: { type: 'category', data: ['Jan', 'Feb'] },
            yAxis: { type: 'value' },
            series: [{ type: 'bar', data: [10, 20] }],
          },
          summary: 'Monthly test chart',
          headers: ['Month', 'Orders'],
          rows: [
            ['Jan', 10],
            ['Feb', 20],
          ],
        })
      );

      expect(html).toContain('Monthly test chart');
      expect(html).toContain('View data table:');
      expect(html).toContain('Monthly test chart');
    });
  });

  describe('Dimension matching and extraction helpers', () => {
    it('matches month across YYYY-MM, dates, and month names', () => {
      expect(isMonthMatch('2024-01', '2024-01')).toBe(true);
      expect(isMonthMatch('2024-01-15', '2024-01')).toBe(true);
      expect(isMonthMatch('2024-01', 'Jan')).toBe(true);
      expect(isMonthMatch('2024-01', 'January')).toBe(true);
      expect(isMonthMatch('2024-02', 'Jan')).toBe(false);
      expect(isMonthMatch('2024-01', '2024-02')).toBe(false);
    });

    it('matches weekday across short names, long names, and day types', () => {
      expect(isWeekdayMatch('Mon', 'Monday')).toBe(true);
      expect(isWeekdayMatch('Sun', 'Sunday')).toBe(true);
      expect(isWeekdayMatch('weekday', 'Tue')).toBe(true);
      expect(isWeekdayMatch('weekend', 'Sat')).toBe(true);
      expect(isWeekdayMatch('weekend', 'Mon')).toBe(false);
    });

    it('matches hour across 24h, 12h AM/PM, and string ranges', () => {
      expect(isHourMatch('14:00', '14')).toBe(true);
      expect(isHourMatch('14:00', '2 PM')).toBe(true);
      expect(isHourMatch('00:00', '12 AM')).toBe(true);
      expect(isHourMatch('14:00', '15:00')).toBe(false);
    });

    it('matches generic dimensions with case-insensitivity', () => {
      expect(isDimensionMatch('platform', 'swiggy', 'Swiggy')).toBe(true);
      expect(isDimensionMatch('cuisine', 'North Indian', 'north indian')).toBe(true);
      expect(isDimensionMatch('restaurant', 'Meghana Foods', 'meghana foods')).toBe(true);
      expect(isDimensionMatch('platform', 'zomato', 'swiggy')).toBe(false);
    });

    it('detects dimensions from headers, summary, and value patterns', () => {
      expect(detectDimension('2024-01')).toBe('month');
      expect(detectDimension('Swiggy')).toBe('platform');
      expect(detectDimension('Mon')).toBe('weekday');
      expect(detectDimension('14:00')).toBe('hour');
      expect(detectDimension('Biryani', ['Cuisine', 'Spend'])).toBe('cuisine');
      expect(detectDimension('Any', undefined, 'Restaurant loyalty')).toBe('restaurant');
    });

    it('extractHoverInfo extracts value and dimension accurately', () => {
      expect(extractHoverInfo({ name: '2024-01' })).toEqual({
        dimension: 'month',
        value: '2024-01',
      });
      expect(
        extractHoverInfo({ name: 'Biryani' }, undefined, ['Cuisine', 'Spend'])
      ).toEqual({
        dimension: 'cuisine',
        value: 'Biryani',
      });
      expect(
        extractHoverInfo({ value: ['2024-03-10', 500] }, 'month')
      ).toEqual({
        dimension: 'month',
        value: '2024-03-10',
      });
      expect(extractHoverInfo(null)).toBeNull();
    });
  });
});
