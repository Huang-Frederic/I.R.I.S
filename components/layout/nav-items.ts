import { ScanLine, BookOpen, Package, Tag, Settings, BarChart3, TrendingUp, Activity, CalendarDays, type LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  /** Translation key under the `nav` namespace (e.g. 'dashboard'). */
  labelKey: 'dashboard' | 'scanner' | 'pokedex' | 'stock' | 'vinted' | 'prices' | 'events' | 'options' | 'logs';
  icon: LucideIcon;
  /** Shown as a tab in the mobile bottom nav. Non-primary items live under
   *  the "Plus" sheet so the bar stays uncluttered. Desktop sidebar shows all. */
  primary?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', labelKey: 'dashboard', icon: BarChart3, primary: true },
  { href: '/prices', labelKey: 'prices', icon: TrendingUp },
  { href: '/pokedex', labelKey: 'pokedex', icon: BookOpen },
  { href: '/submit', labelKey: 'scanner', icon: ScanLine, primary: true },
  { href: '/vinted', labelKey: 'vinted', icon: Tag, primary: true },
  { href: '/stock', labelKey: 'stock', icon: Package, primary: true },
  { href: '/events', labelKey: 'events', icon: CalendarDays },
  { href: '/logs', labelKey: 'logs', icon: Activity },
  { href: '/options', labelKey: 'options', icon: Settings },
];

/** Bottom-nav tabs on mobile (the rest go under "Plus"). */
export const PRIMARY_NAV_ITEMS = NAV_ITEMS.filter((i) => i.primary);
export const SECONDARY_NAV_ITEMS = NAV_ITEMS.filter((i) => !i.primary);
