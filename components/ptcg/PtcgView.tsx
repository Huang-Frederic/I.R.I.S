'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Upload, ChevronRight } from 'lucide-react';

export interface PtcgGameCard {
  id: string;
  played_at: string;
  opponent: string;
  result: 'win' | 'loss' | 'tie';
  prizes_me: number;
  prizes_opponent: number;
  turns: number;
  /** Protagonist of each side — name plus TCGdex image base URL. */
  mine: { name: string; image: string | null } | null;
  theirs: { name: string; image: string | null } | null;
  summary: string | null;
  findings: number;
}

interface Props {
  games: PtcgGameCard[];
}

const RESULT_TEXT: Record<string, string> = {
  win: 'text-emerald-500',
  loss: 'text-red',
  tie: 'text-text-muted',
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

  async function upload(file: File) {
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
        // Validation failures list exactly what was wrong — worth showing, since
        // the file has to be regenerated rather than retried. Server failures
        // carry the underlying message, without which a 500 is undiagnosable
        // from the browser.
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
  }

  return (
    <div className="flex flex-col gap-4">
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

      {/* Games ------------------------------------------------------------- */}
      {games.length === 0 ? (
        <p className="text-text-muted py-6 text-center text-sm">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {games.map((g) => (
            <li key={g.id}>
              <Link
                href={`/ptcg/${g.id}`}
                className="border-border bg-surface hover:bg-surface-2 group block rounded-xl border p-4 transition"
              >
                {/* Matchup ------------------------------------------------- */}
                <div className="flex items-center gap-3 sm:gap-5">
                  <Fighter side={g.mine} align="left" />

                  <div className="shrink-0 text-center">
                    <p
                      className={`text-2xl font-bold tabular-nums sm:text-3xl ${RESULT_TEXT[g.result]}`}
                    >
                      {g.prizes_me}–{g.prizes_opponent}
                    </p>
                    <p
                      className={`text-[10px] font-semibold tracking-wider uppercase ${RESULT_TEXT[g.result]}`}
                    >
                      {t(`result_${g.result}` as 'result_win')}
                    </p>
                  </div>

                  <Fighter side={g.theirs} align="right" />

                  <ChevronRight
                    className="text-text-muted ml-auto hidden h-5 w-5 shrink-0 transition group-hover:translate-x-0.5 sm:block"
                    aria-hidden
                  />
                </div>

                {/* Verdict + meta ------------------------------------------ */}
                {g.summary && (
                  <p className="text-text-muted mt-3 line-clamp-2 text-sm leading-relaxed">
                    {g.summary}
                  </p>
                )}
                <p className="text-text-muted mt-2 text-xs">
                  {new Date(g.played_at).toLocaleDateString(undefined, {
                    day: '2-digit',
                    month: 'short',
                  })}
                  {' · '}
                  {t('turnsCount', { count: g.turns })}
                  {g.findings > 0 && <> · {t('findings', { count: g.findings })}</>}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Upload — deliberately last: you drop a file once per game, but you
          look at the history every time you open the page. */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={`border-border flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-4 text-center transition ${
          dragging ? 'border-accent bg-surface-2' : 'hover:bg-surface-2'
        } ${busy ? 'pointer-events-none opacity-60' : ''}`}
      >
        <Upload className="text-text-muted h-4 w-4 shrink-0" aria-hidden />
        <p className="text-text-muted text-sm">{busy ? t('uploading') : t('dropzone')}</p>
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
    </div>
  );
}

/** One side of the matchup: card art plus the archetype name. */
function Fighter({
  side,
  align,
}: {
  side: { name: string; image: string | null } | null;
  align: 'left' | 'right';
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-2.5 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}
    >
      {side?.image ? (
        <Image
          src={`${side.image}/low.webp`}
          alt=""
          width={54}
          height={75}
          className="shrink-0 rounded"
          unoptimized
        />
      ) : (
        <div className="bg-surface-2 h-[75px] w-[54px] shrink-0 rounded" />
      )}
      <p className="min-w-0 truncate text-sm font-medium">{side?.name ?? '—'}</p>
    </div>
  );
}
