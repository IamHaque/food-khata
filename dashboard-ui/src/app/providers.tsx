import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
export const queryClient = new QueryClient();
if (typeof window !== 'undefined') {
  (window as any).__queryClient = queryClient;
}
export function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}