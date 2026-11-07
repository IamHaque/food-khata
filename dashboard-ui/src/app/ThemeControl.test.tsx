import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { ThemeControl } from './ThemeControl';

describe('ThemeControl (S-004)', () => {
  it('renders an appearance trigger button', () => {
    const html = renderToString(<ThemeControl />);
    expect(html).toContain('aria-label="Appearance"');
  });
});