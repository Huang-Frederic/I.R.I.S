'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { NAV_ITEMS, BUBBLE_ITEMS } from './nav-items';
import { useAgentStatus } from '@/lib/hooks/useAgentStatus';

const SCANNER = NAV_ITEMS.find((i) => i.href === '/submit')!;
const VINTED = NAV_ITEMS.find((i) => i.href === '/vinted')!;

/**
 * Mobile bottom nav — Pokémon HOME style.
 * Scanner (left) · Pokéball (center, raised) · Vinted (right). Tapping the
 * Pokéball spins it one full turn and pops a bubble holding every other tab.
 * Desktop uses the sidebar instead (this whole nav is `md:hidden`).
 */
export default function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const agentStatus = useAgentStatus();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  // Each open bumps this so the ball rotates one more full turn (a fresh spin
  // every tap, via a plain CSS transition on `rotate` — no keyframe needed).
  const [spins, setSpins] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const bubbleActive = BUBBLE_ITEMS.some((i) => isActive(i.href));
  const glow = bubbleActive || open;

  // Composed as one box-shadow (not Tailwind `ring-*`, which this inline style
  // would clobber): just a soft drop shadow at rest (the ball's own ring draws
  // its edge), plus a red halo — gapped in the page colour, to match the notch
  // void around the ball — when active/open.
  const ballShadow = glow
    ? '0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-red), 0 4px 10px rgba(0,0,0,0.4)'
    : '0 4px 10px rgba(0,0,0,0.4)';

  const toggle = () => {
    setSpins((s) => s + 1);
    setOpen((v) => !v);
  };

  const sideTab = (item: typeof SCANNER, withBadge = false) => {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        href={item.href}
        prefetch
        aria-current={active ? 'page' : undefined}
        className={`flex flex-1 flex-col items-center justify-center gap-1 text-[10px] transition-colors ${
          active ? 'text-red' : 'text-text-muted'
        }`}
      >
        <span className="relative">
          <Icon className="h-[22px] w-[22px]" aria-hidden />
          {withBadge && (
            <span
              className={`border-surface absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 ${
                agentStatus === 'online' ? 'bg-green-500' : 'bg-text-faint'
              }`}
            />
          )}
        </span>
        <span className="font-medium">{t(item.labelKey)}</span>
      </Link>
    );
  };

  const nav = (
    <>
      {/* Bubble — every non-primary tab, popped above the Pokéball */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" />

          {/* Centering wrapper (no transform of its own so the pop animation
              below is free to use translate without fighting the centering). */}
          <div
            className="absolute bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] left-1/2 w-[min(21rem,calc(100vw-1.5rem))] -translate-x-1/2"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              data-iris-bubble-panel
              style={{ animation: 'iris-bubble-panel 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) both' }}
              className="bg-surface border-border relative rounded-[1.75rem] border p-2.5 shadow-2xl"
            >
              <div className="grid grid-cols-3 gap-1.5">
                {BUBBLE_ITEMS.map(({ href, labelKey, icon: Icon }, i) => {
                  const active = isActive(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      prefetch
                      onClick={() => setOpen(false)}
                      data-iris-bubble-item
                      style={{ animation: `iris-bubble-item 0.26s cubic-bezier(0.34, 1.56, 0.64, 1) ${40 + i * 28}ms both` }}
                      className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl py-3.5 text-[11px] transition-colors ${
                        active ? 'bg-red-bg text-red' : 'text-text-muted hover:text-text active:bg-surface-2'
                      }`}
                    >
                      <Icon className="h-[26px] w-[26px]" aria-hidden />
                      <span className="font-medium">{t(labelKey)}</span>
                    </Link>
                  );
                })}
              </div>

              {/* Tail — a rotated square tucked under the panel, pointing at the ball */}
              <span
                aria-hidden
                className="bg-surface border-border absolute -bottom-1.5 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 rounded-br-[3px] border-b border-r"
              />
            </div>
          </div>
        </div>
      )}

      <nav
        aria-label={t('ariaLabel')}
        className={`fixed inset-x-0 bottom-0 flex flex-col md:hidden ${open ? 'z-50' : 'z-30'}`}
      >
        {/* Curved bar — its own layer so the notch mask never clips the tabs or
            the ball. The radial-gradient mask bites a circle out of the top
            centre (the "void" the ball nests in); drop-shadow re-draws the top
            edge — including that curve — in the theme's bar-edge colour. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'var(--color-surface)',
            WebkitMaskImage: 'radial-gradient(circle 34px at 50% 0, transparent 0 33px, #000 34px)',
            maskImage: 'radial-gradient(circle 34px at 50% 0, transparent 0 33px, #000 34px)',
            filter: 'drop-shadow(0 0 1px var(--color-bar-edge))',
          }}
        />

        <div className="relative flex h-16">
          {sideTab(SCANNER)}

          {/* Center slot — reserves width so the two tabs never slide under the ball */}
          <div className="w-[4.5rem] shrink-0" aria-hidden />

          {sideTab(VINTED, true)}

          {/* Pokéball — nested in the notch (the bar curves around it), spins on tap */}
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label={t('more')}
            className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform duration-150 active:scale-90"
          >
            {/* The ball — inverted (dark cap over a red base), rotates one extra
                full turn per tap. Colours come from theme tokens. */}
            <span
              data-iris-pokeball
              style={{
                transform: `rotate(${spins * 360}deg)`,
                transition: 'transform 0.7s cubic-bezier(0.34, 1.4, 0.5, 1)',
                boxShadow: ballShadow,
              }}
              className="relative block h-12 w-12 rounded-full"
            >
              {/* Dark cap / red base */}
              <span
                className="absolute inset-0 rounded-full"
                style={{ background: 'linear-gradient(var(--pokeball-dark) 0 50%, var(--color-red) 50% 100%)' }}
              />
              {/* Equator band */}
              <span
                className="absolute inset-x-0 top-1/2 h-[5px] -translate-y-1/2"
                style={{ background: 'var(--pokeball-line)' }}
              />
              {/* Outline ring (drawn on top so it caps the band ends) */}
              <span className="absolute inset-0 rounded-full" style={{ border: '2.5px solid var(--pokeball-line)' }} />
              {/* Center button */}
              <span
                className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ background: 'var(--pokeball-hub)', border: '2.5px solid var(--pokeball-line)' }}
              />
            </span>
          </button>
        </div>

        {/* Home-indicator spacer (iPhone) — the curved bar layer above covers it. */}
        <div style={{ height: 'env(safe-area-inset-bottom)' }} />
      </nav>
    </>
  );

  if (!mounted) return null;
  return createPortal(nav, document.body);
}
