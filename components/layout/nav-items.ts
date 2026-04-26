import { LayoutDashboard, ScanLine, BookOpen, Tag, type LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Home', icon: LayoutDashboard },
  { href: '/submit', label: 'Scanner', icon: ScanLine },
  { href: '/pokedex', label: 'Pokédex', icon: BookOpen },
  { href: '/vinted', label: 'Vinted', icon: Tag },
];
