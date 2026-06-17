'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { NAV_ITEMS } from './nav-items';
import { useAgentStatus } from '@/lib/hooks/useAgentStatus';

export default function Sidebar() {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const agentStatus = useAgentStatus();

  return (
    <aside className="bg-surface border-border fixed inset-y-0 left-0 z-30 hidden w-[220px] flex-col border-r md:flex">
      <div className="px-5 py-7">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt=""
            className="h-12 w-12 shrink-0"
            aria-hidden
          />
          <h1 className="text-red text-3xl font-bold tracking-tight">I.R.I.S</h1>
        </div>
        <p className="text-text-faint mt-1 text-xs uppercase tracking-wider">Pokémon TCG</p>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 pb-4" aria-label={t('ariaLabel')}>
        {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
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
              <span>{t(labelKey)}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-border mx-3 border-t px-3 py-3">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${agentStatus === 'online' ? 'bg-green-500' : 'bg-text-faint'}`} />
          <span className="text-text-muted text-xs">
            {t(agentStatus === 'online' ? 'agentOnline' : 'agentOffline')}
          </span>
        </div>
      </div>
    </aside>
  );
}
