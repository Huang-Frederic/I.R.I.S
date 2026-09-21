import {
  ScanLine,
  BookOpen,
  Package,
  Tag,
  Settings,
  BarChart3,
  TrendingUp,
  Activity,
  CalendarDays,
  Stamp,
  Swords,
  Crosshair,
  PieChart,
  Trophy,
  Bot,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  /** Translation key under the `nav` namespace (e.g. 'dashboard'). */
  labelKey:
    | 'dashboard'
    | 'scanner'
    | 'pokedex'
    | 'stock'
    | 'vinted'
    | 'vintedBot'
    | 'prices'
    | 'events'
    | 'options'
    | 'logs'
    | 'stamps'
    | 'ptcg'
    | 'ptcgTournaments'
    | 'ptcgStats'
    | 'drill';
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', labelKey: 'dashboard', icon: BarChart3 },
  { href: '/prices', labelKey: 'prices', icon: TrendingUp },
  { href: '/pokedex', labelKey: 'pokedex', icon: BookOpen },
  { href: '/stamps', labelKey: 'stamps', icon: Stamp },
  { href: '/submit', labelKey: 'scanner', icon: ScanLine },
  { href: '/vinted', labelKey: 'vinted', icon: Tag },
  { href: '/vinted/bot', labelKey: 'vintedBot', icon: Bot },
  { href: '/stock', labelKey: 'stock', icon: Package },
  { href: '/ptcg', labelKey: 'ptcg', icon: Swords },
  { href: '/ptcg/tournaments', labelKey: 'ptcgTournaments', icon: Trophy },
  { href: '/ptcg/stats', labelKey: 'ptcgStats', icon: PieChart },
  { href: '/drill', labelKey: 'drill', icon: Crosshair },
  { href: '/events', labelKey: 'events', icon: CalendarDays },
  { href: '/logs', labelKey: 'logs', icon: Activity },
  { href: '/options', labelKey: 'options', icon: Settings },
];

/** The two quick-access tabs flanking the central Pokéball on mobile. */
export const BAR_HREFS = ['/submit', '/vinted'] as const;
/** Everything else lives in the Pokéball bubble. */
export const BUBBLE_ITEMS = NAV_ITEMS.filter(
  (i) => !BAR_HREFS.includes(i.href as (typeof BAR_HREFS)[number]),
);

/**
 * The single nav href that should render as active for the current path.
 * A plain `pathname.startsWith(href)` highlights every ancestor at once —
 * `/ptcg` and `/ptcg/stats` both "start with" `/ptcg`, so both tabs lit up
 * when `/ptcg` is itself a nav item. This picks the longest href that is
 * either an exact match or a real path-segment prefix (`href + '/'`), so
 * only the most specific matching tab wins.
 */
export function activeNavHref(pathname: string, hrefs: string[]): string | null {
  const candidates = hrefs.filter((href) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, h) => (h.length > best.length ? h : best));
}
