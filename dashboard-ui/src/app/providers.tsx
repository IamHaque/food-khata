import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiError } from '../lib/api';
import { ErrorBoundary } from '../components/ErrorBoundary';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount: number, error: unknown) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
  },
});
if (typeof window !== 'undefined') {
  (window as any).__queryClient = queryClient;
}
export function Providers({ children }: { children: ReactNode }) {
  return <ErrorBoundary><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></ErrorBoundary>;
}
