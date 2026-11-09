import { queryClient } from '../app/providers';

export function userStorageKey(key: string): string {
  const user = queryClient.getQueryData<{ id: string }>(['auth', 'me']);
  return user ? `${key}:${encodeURIComponent(user.id)}` : key;
}
