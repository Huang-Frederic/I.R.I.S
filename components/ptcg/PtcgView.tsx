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
  /** Findings by severity — the match-history stat line. */
  errors: number;
  warnings: number;
  good: number;
}

interface Props {
  games: PtcgGameCard[];
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

export default function PtcgView({ games }: Props) {
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

  return (
    <div className="flex flex-col gap-3">
      {/* Import — a Pokéball, top right, plus drop-anywhere */}
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
          {games.map((g) => (
            <li key={g.id}>
              <Link
                href={`/ptcg/${g.id}`}
                className="border-border bg-surface hover:bg-surface-2 relative block overflow-hidden rounded-xl border py-4 transition"
              >
                {/* Result edge, match-history style */}
                <span
                  className={`absolute inset-y-0 left-0 w-1 ${RESULT_EDGE[g.result]}`}
                  aria-hidden
                />

                {/* Matchup — mirrored around the score */}
                <div className="flex items-center gap-3 px-5 sm:gap-6">
                  <Fighter side={g.mine} />
                  <div className="w-20 shrink-0 text-center sm:w-24">
                    <p className={`text-3xl font-bold tabular-nums ${RESULT_TEXT[g.result]}`}>
                      {g.prizes_me}–{g.prizes_opponent}
                    </p>
                    <p
                      className={`text-[10px] font-semibold tracking-widest uppercase ${RESULT_TEXT[g.result]}`}
                    >
                      {t(`result_${g.result}` as 'result_win')}
                    </p>
                  </div>
                  <Fighter side={g.theirs} mirrored />
                </div>

                {/* Stat line */}
                <div className="text-text-muted mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-5 text-xs tabular-nums">
                  <span>
                    {new Date(g.played_at).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                  <span>{t('turnsCount', { count: g.turns })}</span>
                  <Stat count={g.errors} dot="bg-red" label={t('statErrors')} />
                  <Stat count={g.warnings} dot="bg-amber-500" label={t('statWarnings')} />
                  <Stat count={g.good} dot="bg-emerald-500" label={t('statGood')} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Drop overlay — only while a file is over the window */}
      {dragging && (
        <div className="border-accent bg-surface/85 pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 border-2 border-dashed backdrop-blur-sm">
          <Pokeball size={56} />
          <p className="text-sm font-medium">{t('dropzone')}</p>
        </div>
      )}
    </div>
  );
}

/** One side of the matchup. Mirrored sides hug the score from both directions. */
function Fighter({
  side,
  mirrored = false,
}: {
  side: { name: string; image: string | null } | null;
  mirrored?: boolean;
}) {
  return (
    <div
      // Both sides use justify-end so each hugs the score. On the mirrored side
      // row-reverse flips the axis, so "end" lands on the left — which is
      // exactly the symmetry we want.
      className={`flex min-w-0 flex-1 items-center justify-end gap-2.5 ${
        mirrored ? 'flex-row-reverse text-left' : 'text-right'
      }`}
    >
      <p className="min-w-0 truncate text-sm font-medium">{side?.name ?? '—'}</p>
      {side?.image ? (
        <Image
          src={`${side.image}/low.webp`}
          alt=""
          width={58}
          height={81}
          className="shrink-0 rounded"
          unoptimized
        />
      ) : (
        <div className="bg-surface-2 h-[81px] w-[58px] shrink-0 rounded" />
      )}
    </div>
  );
}

function Stat({ count, dot, label }: { count: number; dot: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5" title={label}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot} ${count === 0 ? 'opacity-30' : ''}`} />
      <span className={count === 0 ? 'opacity-40' : ''}>{count}</span>
    </span>
  );
}
