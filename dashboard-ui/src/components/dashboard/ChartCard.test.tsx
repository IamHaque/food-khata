import { describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { ChartCard, toCsv } from './ChartCard';

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

  it('toggles table view with sortable columns and rows', () => {
    const data = [{ day: 'Mon', value: 10 }, { day: 'Tue', value: 14 }];
    const html = renderToString(
      <ChartCard title="Sales" tableData={data} showTable>
        <span>chart-here</span>
      </ChartCard>,
    );
    expect(html).toContain('day');
    expect(html).toContain('value');
    expect(html).toContain('Mon');
    expect(html).toContain('Tue');
    expect(html).toContain('aria-sort');
  });

  it('supports tableHeaders and tableRows props for table view', () => {
    const headers = ['Day', 'Hour', 'Orders', 'Spend'];
    const rows = [['Monday', '10:00 - 10:59', 2, 600]];
    const html = renderToString(
      <ChartCard title="Heatmap" tableHeaders={headers} tableRows={rows} showTable>
        <span>chart-here</span>
      </ChartCard>,
    );
    expect(html).toContain('Day');
    expect(html).toContain('Hour');
    expect(html).toContain('Orders');
    expect(html).toContain('Spend');
    expect(html).toContain('Monday');
    expect(html).toContain('10:00 - 10:59');
  });

  it('opens fullscreen dialog with content', () => {
    const html = renderToString(
      <ChartCard title="Sales" fullscreen>
        <span>chart-here</span>
      </ChartCard>,
    );
    expect(html).toContain('aria-label="Toggle fullscreen"');
    expect(html).toContain('chart-here');
  });

  it('exposes PNG and CSV export buttons', () => {
    const onExportPng = vi.fn();
    const onExportCsv = vi.fn();
    const html = renderToString(
      <ChartCard title="Sales" tableData={[{ a: 1 }]} onExportPng={onExportPng} onExportCsv={onExportCsv}>
        <span>chart-here</span>
      </ChartCard>,
    );
    expect(html).toContain('aria-label="Download PNG"');
    expect(html).toContain('aria-label="Download CSV"');
  });

  it('converts chart data to csv with raw numbers', () => {
    const csv = toCsv([{ day: 'Mon', value: 10 }, { day: 'Tue', value: 14 }]);
    expect(csv).toBe('day,value\nMon,10\nTue,14');
  });
});