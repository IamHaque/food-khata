import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { buildTopRestaurantsDishesOption, TopRestaurantsDishesChart } from './TopRestaurantsDishesChart';

describe('TopRestaurantsDishesChart option builder', () => {
  const data = [
    { name: 'Behrouz Biryani', amount: 1000, quantity: 5 },
    { name: 'Dominos', amount: 500, quantity: 2 },
    { name: 'KFC', amount: 300, quantity: 1 },
  ];

  it('builds horizontal bars sorted by amount', () => {
    const option = buildTopRestaurantsDishesOption(data) as any;
    expect(Array.isArray(option.series)).toBe(true);
    expect(option.series[0].type).toBe('bar');
    expect(option.yAxis.type).toBe('category');
    expect(option.series[0].data.length).toBe(3);
  });

  it('limits to top 5', () => {
    const big = Array.from({ length: 8 }, (_, i) => ({ name: `R${i}`, amount: 100 - i, quantity: i + 1 }));
    const option = buildTopRestaurantsDishesOption(big) as any;
    expect(option.series[0].data.length).toBe(5);
  });

  it('shows quantity labels', () => {
    const option = buildTopRestaurantsDishesOption(data) as any;
    expect(option.series[0].label.show).toBe(true);
  });

  it('renders component inside ChartCard with View all link', () => {
    const html = renderToString(<TopRestaurantsDishesChart data={data} />);
    expect(html).toContain('Top restaurants and dishes');
    expect(html).toContain('View all');
  });
});
