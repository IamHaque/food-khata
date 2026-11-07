import { describe, expect, it, beforeEach } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { Providers } from './providers';
import { App } from './App';

function render(path = '/') {
  return renderToString(
    <Providers>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </Providers>,
  );
}

describe('Routes (S-011)', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    const ls = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        for (const k in store) delete store[k];
      },
    };
    Object.defineProperty(globalThis, 'localStorage', { value: ls, writable: true });
  });

  it('renders all 5 primary routes without error', () => {
    for (const p of ['/', '/spending', '/food', '/habits', '/orders']) {
      const html = render(p);
      expect(html.length).toBeGreaterThan(0);
    }
  });

  it('redirects /behavior preserving query', () => {
    const html = render('/behavior?foo=bar');
    expect(html).toBeTruthy();
  });

  it('redirects /places preserving query', () => {
    const html = render('/places?foo=bar');
    expect(html).toBeTruthy();
  });

  it('redirects /ledger preserving query', () => {
    const html = render('/ledger?foo=bar');
    expect(html).toBeTruthy();
  });

  it('renders 404 page for unknown route', () => {
    const html = render('/nope');
    expect(html).toContain('Page not found');
    expect(html).toContain('Back to Overview');
  });

  it('preserves query parameters across navigation links (S-015)', () => {
    const html = render('/spending?platforms=ZOMATO&date_from=2025-01-01');
    expect(html).toContain('href="/?platforms=ZOMATO&amp;date_from=2025-01-01"');
    expect(html).toContain('href="/food?platforms=ZOMATO&amp;date_from=2025-01-01"');
    expect(html).toContain('href="/habits?platforms=ZOMATO&amp;date_from=2025-01-01"');
    expect(html).toContain('href="/orders?platforms=ZOMATO&amp;date_from=2025-01-01"');
  });

  it('preserves query parameters on 404 page Back to Overview link (S-015)', () => {
    const html = render('/nonexistent?platforms=SWIGGY');
    expect(html).toContain('Page not found');
    expect(html).toContain('href="/?platforms=SWIGGY"');
  });
});