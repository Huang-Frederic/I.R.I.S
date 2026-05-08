'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from './nav-items';

export default function BottomNav() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const nav = (
    <nav
      aria-label="Navigation principale"
      className="bg-surface border-border fixed inset-x-0 bottom-0 z-30 flex h-16 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            prefetch={true}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors ${
              active ? 'text-red' : 'text-text-muted'
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden />
            <span className="font-medium">{label}</span>
          </Link>
        );
      })}
    </nav>
  );

  if (!mounted) return null;
  return createPortal(nav, document.body);
}
