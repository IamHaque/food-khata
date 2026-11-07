import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { KpiCard } from './KpiCard';

describe('KpiCard', () => {
  it('renders normal state with value and delta', () => {
    const html = renderToString(<KpiCard title="Revenue" value="123" subtitle="+5%" />);
    expect(html).toContain('Revenue');
    expect(html).toContain('123');
    expect(html).toContain('+5%');
  });

  it('renders loading skeleton', () => {
    const html = renderToString(<KpiCard title="Revenue" isLoading />);
    expect(html).toContain('animate-pulse');
  });
});