import { ScanLine, BookOpen, Package, Tag, Settings, BarChart3, type LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  /** Translation key under the `nav` namespace (e.g. 'dashboard'). */
  labelKey: 'dashboard' | 'scanner' | 'pokedex' | 'stock' | 'vinted' | 'options';
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', labelKey: 'dashboard', icon: BarChart3 },
  { href: '/submit', labelKey: 'scanner', icon: ScanLine },
  { href: '/pokedex', labelKey: 'pokedex', icon: BookOpen },
  { href: '/stock', labelKey: 'stock', icon: Package },
  { href: '/vinted', labelKey: 'vinted', icon: Tag },
  { href: '/options', labelKey: 'options', icon: Settings },
];
