import { LayoutDashboard, TrendingUp, Utensils, Clock, Receipt, Users, RefreshCw, MapPin, HeartPulse, Settings } from 'lucide-react';
import type { ComponentType } from 'react';

export interface NavItem {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  group: 'analytics' | 'manage';
}

/** The one list the sidebar, the compact menu and the command palette render from. Add entries here. */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Overview', to: '/', icon: LayoutDashboard, group: 'analytics' },
  { label: 'Spending', to: '/spending', icon: TrendingUp, group: 'analytics' },
  { label: 'Food', to: '/food', icon: Utensils, group: 'analytics' },
  { label: 'Habits', to: '/habits', icon: Clock, group: 'analytics' },
  { label: 'Places', to: '/places', icon: MapPin, group: 'analytics' },
  { label: 'Orders', to: '/orders', icon: Receipt, group: 'analytics' },
  { label: 'Data health', to: '/data-health', icon: HeartPulse, group: 'analytics' },
  { label: 'Accounts', to: '/home', icon: Users, group: 'manage' },
  { label: 'Sync', to: '/sync', icon: RefreshCw, group: 'manage' },
  { label: 'Settings', to: '/settings', icon: Settings, group: 'manage' },
];

/** Dashboard pages show the filter bar; manage pages do not. */
export const isDashboardPath = (pathname: string) =>
  NAV_ITEMS.some(i => i.group === 'analytics' && i.to === pathname) || ['/behavior', '/ledger'].includes(pathname);
