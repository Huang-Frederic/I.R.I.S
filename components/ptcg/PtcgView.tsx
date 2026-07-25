'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Upload, Trophy, Skull, ChevronRight } from 'lucide-react';
import type { PtcgMistakeCode } from '@/lib/types';
import type { PtcgPatternStat } from '@/lib/utils/ptcg-patterns';

export interface PtcgGameSummary {
  id: string;
  played_at: string;
  me: string;
  opponent: string;
  result: 'win' | 'loss' | 'tie';
  prizes_me: number;
  prizes_opponent: number;
  turns: number;
  opponent_archetype: string | null;
  /** Headline of the analysis, when one exists. */
  summary: string | null;
  findings: number;
}

interface Props {
  games: PtcgGameSummary[];
  patterns: PtcgPatternStat[];
}

const SEVERITY_BAR: Record<string, string> = {
  error: 'bg-red',
  warning: 'bg-amber-500',
  note: 'bg-sky-500',
  good: 'bg-emerald-500',
};

export default function PtcgView({ games, patterns }: Props) {
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
        // the file has to be regenerated rather than retried.
        setDetails(Array.isArray(body?.details?.errors) ? body.details.errors : []);
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
    <div className="flex flex-col gap-6">
      {/* Upload ------------------------------------------------------------ */}
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
        className={`border-border flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center transition ${
          dragging ? 'border-accent bg-surface-2' : 'bg-surface hover:bg-surface-2'
        } ${busy ? 'pointer-events-none opacity-60' : ''}`}
      >
        <Upload className="text-text-muted h-6 w-6" aria-hidden />
        <p className="text-sm font-medium">{busy ? t('uploading') : t('dropzone')}</p>
        <p className="text-text-muted text-xs">{t('dropzoneHint')}</p>
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

      {/* Recurring mistakes ------------------------------------------------ */}
      {patterns.length > 0 && (
        <section className="border-border bg-surface rounded-xl border p-4">
          <h2 className="text-text-muted text-xs font-semibold tracking-wide uppercase">
            {t('patternsTitle')}
          </h2>
          <p className="text-text-muted mt-1 text-xs">{t('patternsHint')}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {patterns.map((p) => (
              <li key={p.code} className="flex items-center gap-3">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${SEVERITY_BAR[p.severity] ?? 'bg-sky-500'}`}
                  aria-hidden
                />
                <span className="flex-1 text-sm">{t(`mistake_${p.code}` as MistakeKey)}</span>
                <span className="text-text-muted shrink-0 text-xs tabular-nums">
                  {t('patternCount', { games: p.games, rate: Math.round(p.rate * 100) })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Games ------------------------------------------------------------- */}
      {games.length === 0 ? (
        <p className="text-text-muted py-8 text-center text-sm">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {games.map((g) => (
            <li key={g.id}>
              <Link
                href={`/ptcg/${g.id}`}
                className="border-border bg-surface hover:bg-surface-2 flex items-center gap-3 rounded-xl border p-3 transition"
              >
                {g.result === 'win' ? (
                  <Trophy className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
                ) : (
                  <Skull className="text-red h-5 w-5 shrink-0" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {t('versus', { opponent: g.opponent_archetype ?? g.opponent })}
                    <span className="text-text-muted ml-2 tabular-nums">
                      {g.prizes_me}–{g.prizes_opponent}
                    </span>
                  </p>
                  <p className="text-text-muted truncate text-xs">{g.summary ?? t('noAnalysis')}</p>
                </div>
                <div className="text-text-muted shrink-0 text-right text-xs">
                  <p className="tabular-nums">
                    {new Date(g.played_at).toLocaleDateString(undefined, {
                      day: '2-digit',
                      month: '2-digit',
                    })}
                  </p>
                  <p>{t('findings', { count: g.findings })}</p>
                </div>
                <ChevronRight className="text-text-muted h-4 w-4 shrink-0" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type MistakeKey = `mistake_${PtcgMistakeCode}`;
