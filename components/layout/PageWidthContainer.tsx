'use client';

import { usePathname } from 'next/navigation';

// Routes whose content genuinely benefits from more than the shared
// max-width — a grouped card grid gains real value from extra columns,
// unlike a text-heavy page. Kept as a route list (not a per-page CSS
// override) so this stays correct regardless of `<main>`'s own sidebar
// offset — no viewport-relative breakout math, no risk of overflowing
// behind the fixed sidebar.
const WIDE_ROUTES = ['/vinted/bot'];

export default function PageWidthContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isWide = WIDE_ROUTES.some((route) => pathname?.startsWith(route));

  return (
    <div className={`mx-auto px-4 pb-20 pt-6 md:px-8 md:pb-8 ${isWide ? 'max-w-none' : 'max-w-[1200px]'}`}>
      {children}
    </div>
  );
}
