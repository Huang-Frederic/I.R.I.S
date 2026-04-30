'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from './nav-items';

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="bg-surface border-border fixed inset-y-0 left-0 z-30 hidden w-[220px] flex-col border-r md:flex">
      <div className="px-5 py-6">
        <h1 className="text-red text-xl font-bold tracking-tight">I.R.I.S</h1>
        <p className="text-text-faint mt-0.5 text-[10px] uppercase tracking-wider">Pokémon TCG</p>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 pb-4">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              prefetch={true}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? 'bg-red-bg text-red font-medium'
                  : 'text-text-muted hover:bg-surface-2 hover:text-text'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
