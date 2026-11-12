import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { KpiDelta } from './KpiDelta';

describe('KpiDelta (S-024 accessibility: arrow and color, never color alone)', () => {
  it('renders positive delta with up arrow', () => {
    const html = renderToString(<KpiDelta value={12.5} />);
    expect(html).toContain('+12.5%');
    // Arrow check (svg icon rendered for ArrowUp)
    expect(html).toContain('lucide-arrow-up');
  });

  it('renders negative delta with down arrow', () => {
    const html = renderToString(<KpiDelta value={-8.2} />);
    expect(html).toContain('-8.2%');
    // Arrow check (svg icon rendered for ArrowDown)
    expect(html).toContain('lucide-arrow-down');
  });

  it('renders zero delta with neutral icon and muted color', () => {
    const html = renderToString(<KpiDelta value={0} />);
    expect(html).toContain('0%');
    expect(html).toContain('text-muted-foreground');
    expect(html).toContain('lucide-minus');
  });

  it('renders nothing for null or missing delta values (no placeholder text)', () => {
    expect(renderToString(<KpiDelta value={null} />)).toBe('');
    expect(renderToString(<KpiDelta value={undefined} />)).toBe('');
  });
});
