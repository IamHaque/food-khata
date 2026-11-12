import { AlertTriangle } from 'lucide-react';
import { useSetupStatus } from '../features/access/api';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
export const isLoopbackHost = (host: string) => LOOPBACK.has(host);

/** Shown only when the server reports plain HTTP and we are not on a loopback address. */
export function InsecureNotice() {
  const status = useSetupStatus();
  if (!status.data?.insecure_transport || isLoopbackHost(globalThis.location?.hostname ?? '')) return null;
  return (
    <p role="status" className="notice notice-warning">
      <AlertTriangle aria-hidden="true" />
      <span>This connection is not encrypted. Use HTTPS if this network is not yours.</span>
    </p>
  );
}
