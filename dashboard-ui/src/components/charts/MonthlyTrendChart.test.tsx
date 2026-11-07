import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { buildMonthlyTrendOption, MonthlyTrendChart } from './MonthlyTrendChart';

describe('MonthlyTrendChart option builder', () => {
  const data = [
    { month: '2025-01', spend: 1000, orders: 5 },
    { month: '2025-02', spend: 1500, orders: 7 },
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

  it('renders component inside ChartCard', () => {
    const html = renderToString(<MonthlyTrendChart data={data} />);
    expect(html).toContain('Monthly spend and orders');
  });
});
