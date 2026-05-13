import { ScanLine, BookOpen, Package, Tag, Settings, BarChart3, TrendingUp, type LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  /** Translation key under the `nav` namespace (e.g. 'dashboard'). */
  labelKey: 'dashboard' | 'scanner' | 'pokedex' | 'stock' | 'vinted' | 'prices' | 'options';
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', labelKey: 'dashboard', icon: BarChart3 },
  { href: '/prices', labelKey: 'prices', icon: TrendingUp },
  { href: '/pokedex', labelKey: 'pokedex', icon: BookOpen },
  { href: '/submit', labelKey: 'scanner', icon: ScanLine },
  { href: '/vinted', labelKey: 'vinted', icon: Tag },
  { href: '/stock', labelKey: 'stock', icon: Package },
  { href: '/options', labelKey: 'options', icon: Settings },
];
