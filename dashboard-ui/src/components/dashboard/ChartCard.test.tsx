import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { ChartCard } from './ChartCard';

describe('ChartCard', () => {
  it('renders normal state with children', () => {
    const html = renderToString(
      <ChartCard title="Sales">
        <span>chart-here</span>
      </ChartCard>,
    );
    expect(html).toContain('Sales');
    expect(html).toContain('chart-here');
  });

  it('renders loading state with skeleton', () => {
    const html = renderToString(
      <ChartCard title="Sales" isLoading>
        <span>chart-here</span>
      </ChartCard>,
    );
    expect(html).toContain('Sales');
    expect(html).toContain('animate-pulse');
  });

  it('renders empty state with reason', () => {
    const html = renderToString(
      <ChartCard title="Sales" isEmpty emptyReason="No data available">
        <span>chart-here</span>
      </ChartCard>,
    );
    expect(html).toContain('No data available');
  });

  it('renders error state with retry', () => {
    const html = renderToString(
      <ChartCard title="Sales" error="Boom" onRetry={() => {}}>
        <span>chart-here</span>
      </ChartCard>,
    );
    expect(html).toContain('Boom');
    expect(html).toContain('Retry');
  });
});