import { describe, expect, it, beforeEach } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { Providers, queryClient } from './providers';
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

describe('App shell (S-010)', () => {
  beforeEach(() => {
    queryClient.setQueryData(['auth', 'me'], { id: 'test', username: 'test', is_owner: false, created_at: '' });
    // provide a minimal localStorage for persistence tests
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

  it('renders navigation links with correct hrefs', () => {
    const html = render('/');
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/spending"');
    expect(html).toContain('href="/food"');
    // primary routes present
    expect(html).toContain('Overview');
    expect(html).toContain('Spending');
  });

  it('marks active page with aria-current="page"', () => {
    const html = render('/');
    expect(html).toContain('aria-current="page"');
  });

  it('reads collapsed state from food-khata-nav-collapsed', () => {
    globalThis.localStorage.setItem('food-khata-nav-collapsed', 'true');
    const html = render('/');
    // collapsed rail width class
    expect(html).toContain('w-16');
    expect(html).toContain('aria-expanded="false"');
  });
});