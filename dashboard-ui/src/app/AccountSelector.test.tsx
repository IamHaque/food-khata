import { describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { AccountSelector } from './AccountSelector';

vi.mock('../features/access/api', () => ({ useAccounts: () => ({ data: [{ local_id: 'alice', phone: 'Alice Cooper', provider: 'SWIGGY', order_count: 842 }, { local_id: 'bob', phone: 'Bob', provider: 'ZOMATO', order_count: 120 }] }) }));

vi.mock('./FilterContext', () => ({
  useFilters: () => ({
    filters: { account_ids: [] },
    update: vi.fn(),
    metadata: {
      data: {
        all_accounts: [
          { id: 'alice', label: 'Alice Cooper', platforms: ['ZOMATO', 'SWIGGY'], order_count: 842 },
          { id: 'bob', label: 'Bob', platforms: ['ZOMATO'], order_count: 120 },
        ],
      },
      isPlaceholderData: false,
    },
  }),
}));

describe('AccountSelector (S-012)', () => {
  it('renders trigger with All Accounts', () => {
    const html = renderToString(<AccountSelector />);
    expect(html).toContain('All my accounts');
  });
});