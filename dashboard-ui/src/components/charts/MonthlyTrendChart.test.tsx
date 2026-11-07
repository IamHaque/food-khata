import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { buildMonthlyTrendOption, MonthlyTrendChart } from './MonthlyTrendChart';

describe('MonthlyTrendChart option builder', () => {
  const data = [
    { month: '2025-01', spend: 1000, orders: 5 },
    { month: '2025-02', spend: 1500, orders: 7 },
  ];

  const compareData = [
    { month: '2024-01', spend: 800, orders: 4 },
    { month: '2024-02', spend: 1200, orders: 6 },
  ];

  it('builds a combo with gradient area spend and bar orders on separate axes', () => {
    const option = buildMonthlyTrendOption(data) as any;
    expect(Array.isArray(option.series)).toBe(true);
    const spendSeries = option.series.find((s: any) => String(s.name).includes('Spend'));
    const ordersSeries = option.series.find((s: any) => String(s.name).includes('Orders'));
    expect(spendSeries?.type).toBe('line');
    expect(spendSeries?.areaStyle).toBeTruthy();
    expect(ordersSeries?.type).toBe('bar');
    expect(Array.isArray(option.yAxis)).toBe(true);
    expect(option.yAxis.length).toBe(2);
  });

  it('without comparison data: normal single trend line/bar and legend (S-024)', () => {
    const option = buildMonthlyTrendOption(data) as any;
    const seriesNames = option.series.map((s: any) => s.name);
    expect(seriesNames).toEqual(['Spend (₹)', 'Orders']);
    expect(option.legend.data).toEqual(['Spend (₹)', 'Orders']);
    const dashedSeries = option.series.filter((s: any) => s.lineStyle?.type === 'dashed');
    expect(dashedSeries.length).toBe(0);
  });

  it('with comparison data: dashed line series exists with comparison name in series and legend (S-024 previous_period)', () => {
    const option = buildMonthlyTrendOption(data, {
      compareData,
      compareMode: 'previous_period',
    }) as any;

    const seriesNames = option.series.map((s: any) => s.name);
    expect(seriesNames).toContain('Previous Period');
    expect(option.legend.data).toContain('Previous Period');

    const compSeries = option.series.find((s: any) => s.name === 'Previous Period');
    expect(compSeries?.type).toBe('line');
    expect(compSeries?.lineStyle?.type).toBe('dashed');
    expect(compSeries?.lineStyle?.width).toBe(2);
    expect(compSeries?.data).toEqual([800, 1200]);
  });

  it('with comparison data: dashed line series exists with comparison name in series and legend (S-024 previous_year)', () => {
    const option = buildMonthlyTrendOption(data, {
      compareData,
      compareMode: 'previous_year',
    }) as any;

    const seriesNames = option.series.map((s: any) => s.name);
    expect(seriesNames).toContain('Previous Year');
    expect(option.legend.data).toContain('Previous Year');

    const compSeries = option.series.find((s: any) => s.name === 'Previous Year');
    expect(compSeries?.type).toBe('line');
    expect(compSeries?.lineStyle?.type).toBe('dashed');
    expect(compSeries?.lineStyle?.width).toBe(2);
    expect(compSeries?.data).toEqual([800, 1200]);
  });

  it('when compareMode is "none", only current series is rendered (S-024)', () => {
    const option = buildMonthlyTrendOption(data, {
      compareData,
      compareMode: 'none',
    }) as any;

    const seriesNames = option.series.map((s: any) => s.name);
    expect(seriesNames).toEqual(['Spend (₹)', 'Orders']);
    expect(option.legend.data).not.toContain('Previous Period');
    expect(option.legend.data).not.toContain('Previous Year');
  });

  it('tooltip formatter formats comparison series as currency', () => {
    const option = buildMonthlyTrendOption(data, {
      compareData,
      compareMode: 'previous_period',
    }) as any;

    const tooltip = option.tooltip.formatter([
      { axisValueLabel: '2025-01', seriesName: 'Spend (₹)', value: 1000 },
      { seriesName: 'Orders', value: 5 },
      { seriesName: 'Previous Period', value: 800 },
    ]);

    expect(tooltip).toContain('2025-01');
    expect(tooltip).toContain('Spend (₹):');
    expect(tooltip).toContain('₹1,000');
    expect(tooltip).toContain('Orders:');
    expect(tooltip).toContain('5 orders');
    expect(tooltip).toContain('Previous Period:');
    expect(tooltip).toContain('₹800');
  });

  it('metric toggle switches series', () => {
    const spendOnly = buildMonthlyTrendOption(data, 'spend') as any;
    const ordersOnly = buildMonthlyTrendOption(data, 'orders') as any;
    expect(spendOnly.series.length).toBe(1);
    expect(spendOnly.series[0].type).toBe('line');
    expect(ordersOnly.series.length).toBe(1);
    expect(ordersOnly.series[0].type).toBe('bar');
  });

  it('includes brush/dataZoom and toolbox restore for reset zoom', () => {
    const option = buildMonthlyTrendOption(data) as any;
    expect(option.dataZoom).toBeTruthy();
    expect(option.toolbox?.feature?.restore).toBeTruthy();
  });

  it('renders component inside ChartCard with comparison data', () => {
    const html = renderToString(
      <MonthlyTrendChart
        data={data}
        compareData={compareData}
        compareMode="previous_period"
      />
    );
    expect(html).toContain('Monthly spend and orders');
    expect(html).toContain('Monthly spending peaked');
  });
});
