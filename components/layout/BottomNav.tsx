'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { MoreHorizontal, X } from 'lucide-react';
import { PRIMARY_NAV_ITEMS, SECONDARY_NAV_ITEMS } from './nav-items';
import { useAgentStatus } from '@/lib/hooks/useAgentStatus';

export default function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const agentStatus = useAgentStatus();
  const [mounted, setMounted] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const moreActive = SECONDARY_NAV_ITEMS.some((i) => isActive(i.href));

  const tabClass = (active: boolean) =>
    `flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors ${
      active ? 'text-red' : 'text-text-muted'
    }`;

  const nav = (
    <>
      {/* "Plus" sheet — overflow nav items in a grid, above the bar */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="bg-surface border-border absolute inset-x-0 bottom-0 rounded-t-2xl border-t p-4 shadow-2xl"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-text-muted text-xs font-medium uppercase">{t('more')}</span>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label={t('close')} className="text-text-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {SECONDARY_NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    prefetch={true}
                    onClick={() => setMoreOpen(false)}
                    className={`bg-surface-2 flex flex-col items-center justify-center gap-1.5 rounded-xl py-4 text-xs transition-colors ${
                      active ? 'text-red' : 'text-text-muted hover:text-text'
                    }`}
                  >
                    <Icon className="h-6 w-6" aria-hidden />
                    <span className="font-medium">{t(labelKey)}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav
        aria-label={t('ariaLabel')}
        className="bg-surface border-border fixed inset-x-0 bottom-0 z-30 flex flex-col border-t md:hidden"
      >
        {/* Fixed 64 px zone for the items — safe-area-inset-bottom must NOT eat into this. */}
        <div className="flex h-16">
          {PRIMARY_NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                prefetch={true}
                aria-current={active ? 'page' : undefined}
                className={tabClass(active)}
              >
                {href === '/vinted' ? (
                  <span className="relative">
                    <Icon className="h-5 w-5" aria-hidden />
                    <span
                      className={`border-surface absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border ${
                        agentStatus === 'online' ? 'bg-green-500' : 'bg-text-faint'
                      }`}
                    />
                  </span>
                ) : (
                  <Icon className="h-5 w-5" aria-hidden />
                )}
                <span className="font-medium">{t(labelKey)}</span>
              </Link>
            );
          })}

          {/* "Plus" — opens the overflow sheet */}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            aria-label={t('more')}
            className={tabClass(moreActive || moreOpen)}
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden />
            <span className="font-medium">{t('more')}</span>
          </button>
        </div>
        {/* Spacer that fills the home-indicator zone on iPhone (34 px on Face ID
            models, 0 on older devices). Keeps the bg-surface colour solid. */}
        <div style={{ height: 'env(safe-area-inset-bottom)' }} />
      </nav>
    </>
  );

  if (!mounted) return null;
  return createPortal(nav, document.body);
}
