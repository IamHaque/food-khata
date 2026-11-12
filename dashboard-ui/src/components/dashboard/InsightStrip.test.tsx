import { describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { InsightStrip } from './InsightStrip';

const update = vi.fn();

vi.mock('../../app/FilterContext', () => ({
  useFilters: () => ({
    filters: {},
    update,
    clear: vi.fn(),
    notice: '',
    clearNotice: vi.fn(),
    metadata: { data: null, isPlaceholderData: false },
    applyCrossFilter: vi.fn(),
    undoCrossFilter: vi.fn(),
  }),
}));

const insights = [
  { key: 'most_frequent_platform', text: 'Top platform', value: 'Swiggy', filter_patch: { platforms: ['SWIGGY'], restaurant_ids: [] } },
  { key: 'top_restaurant', text: 'Top restaurant', value: 'Biryani House', filter_patch: { platforms: [], restaurant_ids: ['r1'] } },
  { key: 'fee_percentage', text: 'Fee share', value: '12%', filter_patch: { platforms: [], restaurant_ids: [] } },
  { key: 'most_frequent_platform', text: 'Fourth', value: '4', filter_patch: { platforms: ['ZOMATO'], restaurant_ids: [] } },
  { key: 'most_frequent_platform', text: 'Fifth', value: '5', filter_patch: { platforms: [], restaurant_ids: [] } },
] as any;

describe('InsightStrip', () => {
  it('renders up to 4 cards with icon, text, and value', () => {
    const html = renderToString(<InsightStrip insights={insights} />);
    expect(html).toContain('Top platform');
    expect(html).toContain('Swiggy');
    expect(html).toContain('Top restaurant');
    expect(html).toContain('Biryani House');
    expect(html).toContain('Fourth');
    expect(html).not.toContain('Fifth');
    const buttons = html.match(/<button/g) ?? [];
    expect(buttons.length).toBe(4);
  });

  it('click invokes filter update with filter_patch', () => {
    const insight = insights[1];
    const element = InsightStrip({ insights: [insight] });
    const button = Array.isArray(element.props.children)
      ? element.props.children[0]
      : element.props.children;
    (button.props as { insight: { filter_patch: unknown }; onApply: (p: unknown) => void }).onApply(button.props.insight.filter_patch);
    expect(update).toHaveBeenCalledWith(insight.filter_patch);
  });

  it('empty insights array returns null', () => {
    expect(InsightStrip({ insights: [] })).toBeNull();
    expect(renderToString(<InsightStrip insights={[]} />)).toBe('');
  });

  it('is a focusable button', () => {
    const html = renderToString(<InsightStrip insights={[insights[0]]} />);
    expect(html).toContain('type="button"');
  });
});
