import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { SyncStatusChipButton, SyncStatusChipControl } from './SyncStatusChip';
import { SCOPE_NOTICE, SyncStatusPanelBody, useSyncPanelState } from './SyncStatusPanel';
import { formatExactTimestamp, formatRelativeSync } from './sync-format';

const recent = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

const completeHealth = {
  generated_at: recent,
  history_complete: true,
  details_complete: true,
  verified_percent: 75,
  null_rates: { restaurant_name: 37.5, items_summary: 12.5 },
  duplicate_orders: 1,
  reconciliation_anomalies: 2,
  imports: [{ account_id: 'acc-1', platform: 'swiggy', history_complete: true, details_complete: true }],
};

const summary = {
  total_orders: 21,
  date_from: '2024-01-01',
  date_to: '2026-10-31',
  platforms: [
    { platform: 'swiggy', orders: 12 },
    { platform: 'zomato', orders: 9 },
  ],
};

function PanelProbe() {
  const { open } = useSyncPanelState();
  return <span>{open ? 'panel-open' : 'panel-closed'}</span>;
}

function renderProbe(path: string) {
  return renderToString(
    <MemoryRouter initialEntries={[path]}>
      <PanelProbe />
    </MemoryRouter>,
  );
}

describe('sync status formatting', () => {
  it('formats relative sync times and exact timestamps', () => {
    const now = new Date('2026-11-08T12:00:00');
    const twoHoursAgo = new Date('2026-11-08T10:00:00').toISOString();
    const earlierToday = new Date('2026-11-08T00:00:00').toISOString();

    expect(formatRelativeSync(twoHoursAgo, now)).toBe('Synced 2h ago');
    expect(formatRelativeSync(earlierToday, now)).toBe('Synced today');
    expect(formatExactTimestamp(twoHoursAgo)).toBe('2026-11-08 10:00:00');
  });
});

describe('SyncStatusChip (S-013)', () => {
  it('renders the relative last-sync time', () => {
    const html = renderToString(<SyncStatusChipButton health={completeHealth} onOpen={() => undefined} />);
    expect(html).toContain('Synced 2h ago');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('data-incomplete="false"');
    expect(html).toContain(formatExactTimestamp(recent));
  });

  it('turns warning-colored when history or details are incomplete', () => {
    const html = renderToString(
      <SyncStatusChipButton
        health={{ ...completeHealth, history_complete: false, details_complete: false }}
        onOpen={() => undefined}
      />,
    );
    expect(html).toContain('data-incomplete="true"');
    expect(html).toContain('border-warning');
    expect(html).toContain('data incomplete');
  });

  it('requests the sheet panel when clicked', () => {
    let opened = false;
    const element = SyncStatusChipControl({
      health: completeHealth,
      onOpen: () => {
        opened = true;
      },
    });
    expect(React.isValidElement(element)).toBe(true);
    (element.props as { onClick: () => void }).onClick();
    expect(opened).toBe(true);
  });
});

describe('SyncStatusPanel (S-013)', () => {
  it('renders health metrics, scope notice, and dates', () => {
    const html = renderToString(<SyncStatusPanelBody health={completeHealth} summary={summary} />);

    expect(html).toContain('Data Health &amp; Sync Status');
    expect(html).toContain('Complete');
    expect(html).toContain('2024-01-01');
    expect(html).toContain('2026-10-31');
    expect(html).toContain('Total orders');
    expect(html).toContain('Swiggy orders');
    expect(html).toContain('Zomato orders');
    expect(html).toContain('Verified bills');
    expect(html).toContain('Unverified totals');
    expect(html).toContain('Missing restaurant names');
    expect(html).toContain('Missing items');
    expect(html).toContain('37.5%');
    expect(html).toContain('12.5%');
    expect(html).toContain(SCOPE_NOTICE);
  });

  it('shows an incomplete badge when coverage is partial', () => {
    const html = renderToString(
      <SyncStatusPanelBody
        health={{ ...completeHealth, history_complete: false, details_complete: true }}
        summary={summary}
      />,
    );
    expect(html).toContain('Incomplete');
    expect(html).toContain('border-warning');
  });

  it('auto-opens when the URL contains sync=open', () => {
    expect(renderProbe('/?sync=open')).toContain('panel-open');
    expect(renderProbe('/')).toContain('panel-closed');
  });
});
