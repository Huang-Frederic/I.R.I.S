'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Pokeball from '@/components/ui/Pokeball';

export interface PtcgGameCard {
  id: string;
  played_at: string;
  result: 'win' | 'loss' | 'tie';
  prizes_me: number;
  prizes_opponent: number;
  turns: number;
  /** Protagonist of each side — name plus TCGdex image base URL. */
  mine: { name: string; image: string | null } | null;
  theirs: { name: string; image: string | null } | null;
  /** 0–100, derived from the analysis. Null when the game has none. */
  score: number | null;
  errors: number;
  warnings: number;
  good: number;
}

const RESULT_TEXT: Record<string, string> = {
  win: 'text-emerald-500',
  loss: 'text-red',
  tie: 'text-text-muted',
};

const RESULT_EDGE: Record<string, string> = {
  win: 'bg-emerald-500',
  loss: 'bg-red',
  tie: 'bg-text-muted',
};

/** Score bands. Deliberately generous at the top: 100 means "left nothing on
 *  the table", which is reachable, not a claim of perfect play. */
function scoreTone(score: number) {
  if (score >= 80) return { text: 'text-emerald-500', bar: 'bg-emerald-500' };
  if (score >= 55) return { text: 'text-amber-500', bar: 'bg-amber-500' };
  return { text: 'text-red', bar: 'bg-red' };
}

export default function PtcgView({ games }: { games: PtcgGameCard[] }) {
  const t = useTranslations('ptcg');
  const tErrors = useTranslations('errors');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);

  const upload = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      setDetails([]);
      try {
        const res = await fetch('/api/ptcg/games', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: await file.text(),
        });
        const body = await res.json();
        if (!res.ok) {
          const code = body?.error ?? 'server_error';
          setError(tErrors.has(code) ? tErrors(code) : (body?.message ?? code));
          // Validation failures list exactly what was wrong — worth showing,
          // since the file has to be regenerated rather than retried. Server
          // failures carry the underlying message, without which a 500 is
          // undiagnosable from the browser.
          setDetails(
            Array.isArray(body?.details?.errors)
              ? body.details.errors
              : body?.details?.underlying
                ? [String(body.details.underlying)]
                : [],
          );
          return;
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [router, tErrors],
  );

  // Drop anywhere on the page. Browsers fire dragleave when the pointer crosses
  // into a child element, so a naive handler flickers — count enter/leave pairs
  // and only clear the overlay when the counter returns to zero.
  useEffect(() => {
    let depth = 0;
    const onEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      depth += 1;
      setDragging(true);
    };
    const onLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) void upload(file);
    };

    addEventListener('dragenter', onEnter);
    addEventListener('dragleave', onLeave);
    addEventListener('dragover', onOver);
    addEventListener('drop', onDrop);
    return () => {
      removeEventListener('dragenter', onEnter);
      removeEventListener('dragleave', onLeave);
      removeEventListener('dragover', onOver);
      removeEventListener('drop', onDrop);
    };
  }, [upload]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end gap-3">
        <p className="text-text-muted text-xs">{busy ? t('uploading') : t('dropAnywhere')}</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label={t('import')}
          title={t('import')}
          className="hover:bg-surface-2 rounded-full p-1.5 transition active:scale-90 disabled:opacity-50"
        >
          <Pokeball size={28} />
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
        />
      </div>

      {error && (
        <div className="border-red/40 bg-red/10 rounded-lg border px-4 py-3 text-sm">
          <p className="text-red font-medium">{error}</p>
          {details.length > 0 && (
            <ul className="text-text-muted mt-2 list-inside list-disc font-mono text-xs">
              {details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {games.length === 0 ? (
        <p className="text-text-muted py-10 text-center text-sm">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {games.map((g) => {
            const tone = g.score !== null ? scoreTone(g.score) : null;
            return (
              <li key={g.id}>
                <Link
                  href={`/ptcg/${g.id}`}
                  className="border-border bg-surface hover:bg-surface-2 relative block overflow-hidden rounded-xl border transition"
                >
                  <span
                    className={`absolute inset-y-0 left-0 w-1 ${RESULT_EDGE[g.result]}`}
                    aria-hidden
                  />

                  {/* ---------- Mobile: cards facing off, stats in a strip ---------- */}
                  <div className="px-4 pt-5 pb-3 pl-6 sm:hidden">
                    <div className="flex items-center justify-center">
                      <CardArt side={g.mine} width={92} className="-rotate-[4deg]" />
                      <div className="border-border bg-surface-off z-10 -mx-4 rounded-full border px-4 py-2 text-center shadow-lg">
                        <p className={`text-xl font-bold tabular-nums ${RESULT_TEXT[g.result]}`}>
                          {g.prizes_me}–{g.prizes_opponent}
                        </p>
                        <p
                          className={`text-[9px] font-bold tracking-widest uppercase ${RESULT_TEXT[g.result]}`}
                        >
                          {t(`result_${g.result}` as 'result_win')}
                        </p>
                      </div>
                      <CardArt side={g.theirs} width={92} className="rotate-[4deg]" />
                    </div>

                    <div className="border-border mt-4 flex border-t pt-3">
                      <Cell
                        value={g.score !== null ? `${g.score}%` : '—'}
                        label={t('statScore')}
                        tone={tone?.text}
                      />
                      <Cell value={String(g.turns)} label={t('statTurns')} />
                      <Cell
                        value={
                          <span className="inline-flex items-center gap-2">
                            <Dot n={g.errors} color="bg-red" title={t('statErrors')} />
                            <Dot n={g.warnings} color="bg-amber-500" title={t('statWarnings')} />
                            <Dot n={g.good} color="bg-emerald-500" title={t('statGood')} />
                          </span>
                        }
                        label={t('statAnalysis')}
                      />
                      <Cell value={fmtDate(g.played_at)} label={t('statDate')} />
                    </div>
                  </div>

                  {/* ---------- Desktop: duel left, score bar right ---------- */}
                  <div className="hidden items-stretch gap-6 py-4 pr-6 pl-7 sm:flex">
                    <div className="flex shrink-0 items-center gap-4">
                      <CardArt side={g.mine} width={100} />
                      <div className="w-20 text-center">
                        <p className={`text-2xl font-bold tabular-nums ${RESULT_TEXT[g.result]}`}>
                          {g.prizes_me}–{g.prizes_opponent}
                        </p>
                        <p
                          className={`text-[10px] font-bold tracking-widest uppercase ${RESULT_TEXT[g.result]}`}
                        >
                          {t(`result_${g.result}` as 'result_win')}
                        </p>
                      </div>
                      <CardArt side={g.theirs} width={100} />
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-2.5">
                      <div className="flex items-baseline justify-between">
                        <span className="text-text-muted text-xs">{t('scoreLabel')}</span>
                        <span className={`text-lg font-bold tabular-nums ${tone?.text ?? ''}`}>
                          {g.score !== null ? `${g.score}%` : '—'}
                        </span>
                      </div>
                      <div className="bg-surface-off h-[7px] overflow-hidden rounded-full">
                        {g.score !== null && (
                          <span
                            className={`block h-full rounded-full ${tone!.bar}`}
                            style={{ width: `${g.score}%` }}
                          />
                        )}
                      </div>
                      <div className="text-text-muted flex items-center justify-between text-xs tabular-nums">
                        <span className="flex items-center gap-3">
                          <Dot n={g.errors} color="bg-red" title={t('statErrors')} />
                          <Dot n={g.warnings} color="bg-amber-500" title={t('statWarnings')} />
                          <Dot n={g.good} color="bg-emerald-500" title={t('statGood')} />
                        </span>
                        <span>
                          {fmtDate(g.played_at)} · {t('turnsCount', { count: g.turns })}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {dragging && (
        <div className="border-accent bg-surface/85 pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 border-2 border-dashed backdrop-blur-sm">
          <Pokeball size={56} />
          <p className="text-sm font-medium">{t('dropzone')}</p>
        </div>
      )}
    </div>
  );
}

function CardArt({
  side,
  width,
  className = '',
}: {
  side: { name: string; image: string | null } | null;
  width: number;
  className?: string;
}) {
  const height = Math.round(width * 1.393); // standard card ratio
  if (!side?.image) {
    return (
      <div className={`bg-surface-2 shrink-0 rounded ${className}`} style={{ width, height }} />
    );
  }
  return (
    <Image
      src={`${side.image}/low.webp`}
      alt={side.name}
      title={side.name}
      width={width}
      height={height}
      className={`shrink-0 rounded shadow-md ${className}`}
      unoptimized
    />
  );
}

function Cell({ value, label, tone }: { value: React.ReactNode; label: string; tone?: string }) {
  return (
    <div className="border-border flex-1 text-center not-first:border-l">
      <div className={`text-sm font-semibold tabular-nums ${tone ?? ''}`}>{value}</div>
      <div className="text-text-muted mt-0.5 text-[9px] tracking-wider uppercase">{label}</div>
    </div>
  );
}

function Dot({ n, color, title }: { n: number; color: string; title: string }) {
  return (
    <span className={`flex items-center gap-1.5 ${n === 0 ? 'opacity-35' : ''}`} title={title}>
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
      {n}
    </span>
  );
}
