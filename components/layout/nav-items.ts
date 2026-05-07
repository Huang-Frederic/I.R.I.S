import { ScanLine, BookOpen, Package, Tag, Settings, BarChart3, type LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/submit', label: 'Scanner', icon: ScanLine },
  { href: '/pokedex', label: 'Pokédex', icon: BookOpen },
  { href: '/stock', label: 'Stock', icon: Package },
  { href: '/vinted', label: 'Vinted', icon: Tag },
  { href: '/options', label: 'Options', icon: Settings },
];
