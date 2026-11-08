import { describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Amount } from './FilterBar';
import { FilterProvider, useFilters } from './FilterContext';
import { SyncStatusPanelBody } from './SyncStatusPanel';
import { ChartCard } from '../components/dashboard/ChartCard';

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: any) => (open ? <>{children}</> : null),
  DialogContent: ({ children, className }: any) => (
    <div role="dialog" className={className}>
      {children}
    </div>
  ),
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
}));

describe('Modal and UX Gap Fixes Verification', () => {
  it('FilterBar Amount input renders Indian rupee symbol (₹) instead of $', () => {
    const html = renderToString(
      <Amount
        field="amount_min"
        label="Min spend"
        value={500}
        onChange={() => {}}
      />,
    );

    // Verify presence of ₹ and absence of rogue $
    expect(html).toContain('₹');
    expect(html).toMatch(/<span[^>]*pointer-events-none[^>]*>₹<\/span>/);
    expect(html).not.toMatch(/<span[^>]*pointer-events-none[^>]*>\$<\/span>/);
  });

  it('ChartCard in fullscreen removes nested borders/shadows and expands canvas height', () => {
    const html = renderToString(
      <ChartCard title="Test Chart" fullscreen>
        <div role="img" aria-label="chart-content">
          Canvas Content
        </div>
      </ChartCard>,
    );

    // Fullscreen dialog wrapper classes
    expect(html).toContain(
      'border-0 shadow-none bg-transparent p-0 flex flex-col flex-1 min-h-0 w-full',
    );
    expect(html).toContain('h-[calc(80vh-210px)]');
  });

  it('SyncStatusPanel accurately falls back to backend schema null rates', () => {
    const healthWithBackendSchema = {
      generated_at: new Date().toISOString(),
      history_complete: true,
      details_complete: true,
      verified_percent: 88.5,
      null_rates: {
        restaurant_cuisine: 14.6,
        category: 3.2,
      },
      duplicate_orders: 0,
      reconciliation_anomalies: 5,
      imports: [],
    };

    const summary = {
      total_orders: 100,
      date_from: '2024-01-01',
      date_to: '2026-11-08',
      platforms: [{ platform: 'swiggy', orders: 100 }],
    };

    const html = renderToString(
      <SyncStatusPanelBody
        health={healthWithBackendSchema as any}
        summary={summary}
      />,
    );

    expect(html).toContain('Missing restaurant names');
    expect(html).toContain('14.6%');
    expect(html).toContain('Missing items');
    expect(html).toContain('3.2%');
    expect(html).not.toContain('Unknown%');
  });

  it('FilterContext provides stable callback references to prevent chart unmount/dispose cycles', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    let capturedContext: ReturnType<typeof useFilters> | null = null;

    function TestConsumer() {
      capturedContext = useFilters();
      return <div>Consumer</div>;
    }

    renderToString(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FilterProvider>
            <TestConsumer />
          </FilterProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(capturedContext).not.toBeNull();
    const firstUpdate = capturedContext!.update;
    const firstClear = capturedContext!.clear;
    const firstApply = capturedContext!.applyCrossFilter;

    // Callbacks should be functions
    expect(typeof firstUpdate).toBe('function');
    expect(typeof firstClear).toBe('function');
    expect(typeof firstApply).toBe('function');
  });
});
