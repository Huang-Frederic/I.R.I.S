import { ScanLine, BookOpen, Package, Tag, Settings, BarChart3, TrendingUp, Activity, CalendarDays, Stamp, type LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  /** Translation key under the `nav` namespace (e.g. 'dashboard'). */
  labelKey: 'dashboard' | 'scanner' | 'pokedex' | 'stock' | 'vinted' | 'prices' | 'events' | 'options' | 'logs' | 'stamps';
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', labelKey: 'dashboard', icon: BarChart3 },
  { href: '/prices', labelKey: 'prices', icon: TrendingUp },
  { href: '/pokedex', labelKey: 'pokedex', icon: BookOpen },
  { href: '/stamps', labelKey: 'stamps', icon: Stamp },
  { href: '/submit', labelKey: 'scanner', icon: ScanLine },
  { href: '/vinted', labelKey: 'vinted', icon: Tag },
  { href: '/stock', labelKey: 'stock', icon: Package },
  { href: '/events', labelKey: 'events', icon: CalendarDays },
  { href: '/logs', labelKey: 'logs', icon: Activity },
  { href: '/options', labelKey: 'options', icon: Settings },
];

/** The two quick-access tabs flanking the central Pokéball on mobile. */
export const BAR_HREFS = ['/submit', '/vinted'] as const;
/** Everything else lives in the Pokéball bubble. */
export const BUBBLE_ITEMS = NAV_ITEMS.filter((i) => !BAR_HREFS.includes(i.href as (typeof BAR_HREFS)[number]));
