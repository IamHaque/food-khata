import { LayoutDashboard, TrendingUp, Utensils, Clock, Receipt, Users, RefreshCw, MapPin, HeartPulse, Settings, ListChecks } from 'lucide-react';
import type { ComponentType } from 'react';

export interface NavItem {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  group: 'analytics' | 'data' | 'settings';
  /** Analytics pages show the global filter bar and the review banner. */
  filtered?: boolean;
  /** Other paths that belong under this item (detail pages), so it stays highlighted. */
  also?: string[];
}

export const NAV_GROUPS: { id: NavItem['group']; label: string }[] = [
  { id: 'analytics', label: 'Analytics' },
  { id: 'data', label: 'Data' },
  { id: 'settings', label: 'Settings' },
];

/** The one list the sidebar, the More sheet, the tab bar and the command palette render from. Add entries here. */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Overview', to: '/', icon: LayoutDashboard, group: 'analytics', filtered: true },
  { label: 'Spending', to: '/spending', icon: TrendingUp, group: 'analytics', filtered: true },
  { label: 'Food', to: '/food', icon: Utensils, group: 'analytics', filtered: true },
  { label: 'Habits', to: '/habits', icon: Clock, group: 'analytics', filtered: true },
  { label: 'Places', to: '/places', icon: MapPin, group: 'analytics', filtered: true },
  { label: 'Orders', to: '/orders', icon: Receipt, group: 'data', filtered: true },
  { label: 'Data health', to: '/data-health', icon: HeartPulse, group: 'data', filtered: true },
  { label: 'Accounts', to: '/accounts', icon: Users, group: 'data', also: ['/accounts/link'] },
  { label: 'Sync', to: '/sync', icon: RefreshCw, group: 'data' },
  { label: 'Jobs', to: '/jobs', icon: ListChecks, group: 'data', also: ['/jobs/'] },
  { label: 'Settings', to: '/settings', icon: Settings, group: 'settings', also: ['/account/password'] },
];

export const isNavActive = (item: NavItem, pathname: string) =>
  pathname === item.to || (item.also ?? []).some(p => (p.endsWith('/') ? pathname.startsWith(p) : pathname === p));

/** Analytics pages show the filter bar; Accounts, Sync, Jobs and Settings do not. */
export const isDashboardPath = (pathname: string) =>
  NAV_ITEMS.some(i => i.filtered && i.to === pathname) || ['/behavior', '/ledger'].includes(pathname);
