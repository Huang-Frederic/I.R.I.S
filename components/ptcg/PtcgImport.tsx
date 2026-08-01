'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Upload } from 'lucide-react';
import Pokeball from '@/components/ui/Pokeball';
import { parseJsonLoose } from '@/lib/utils/json-from-text';
import { fromLocalInputValue, toLocalInputValue } from '@/lib/utils/local-datetime';

/** Survives a refresh: re-exporting a log from PTCG Live is not possible, and
 *  losing a paste to a stray reload would mean losing the game. */
const DRAFT = 'ptcg-import-draft';

/** Now, in local wall time. A game is imported minutes after it is played, so
 *  this is right far more often than any date-only default — and it carries the
 *  time, without which two games on one evening cannot be told apart. */
const now = () => toLocalInputValue(new Date());

/**
 * One box, one button. The box takes either of the two things Frédéric ever
 * has in hand — the battle log copied from PTCG Live (game displays without
 * annotations), or the self-contained JSON a coaching conversation returned
 * (game displays with the debrief). No parse step, no digest: pasting is
 * importing.
 */
export default function PtcgImport() {
  const t = useTranslations('ptcg');
  const tErrors = useTranslations('errors');
  const router = useRouter();

  const [text, setText] = useState('');
  const [playedAt, setPlayedAt] = useState(now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Deferred a tick: sessionStorage is client-only (an initializer would
  // mismatch SSR), and the purity rule forbids synchronous setState in effects.
  useEffect(() => {
    const id = setTimeout(() => {
      const saved = sessionStorage.getItem(DRAFT);
      if (!saved) return;
      try {
        const d = JSON.parse(saved) as { text: string; playedAt: string };
        setText(d.text);
        setPlayedAt(d.playedAt || now());
      } catch {
        sessionStorage.removeItem(DRAFT);
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const fail = useCallback(
    async (res: Response) => {
      const body = await res.json().catch(() => ({}));
      const code = body?.error ?? 'server_error';
      setError(tErrors.has(code) ? tErrors(code) : (body?.message ?? code));
      const d = body?.details;
      setDetails(
        Array.isArray(d?.errors) ? d.errors : d?.underlying ? [String(d.underlying)] : [],
      );
    },
    [tErrors],
  );

  /** Builds the request body from whatever was pasted or dropped. */
  const toPayload = (input: string): { body: unknown } | { error: string } => {
    const read = parseJsonLoose(input);
    if (read.ok && read.value && typeof read.value === 'object') {
      const v = read.value as {
        bundleVersion?: unknown;
        raw?: unknown;
        analysis?: unknown;
        playedAt?: unknown;
        moments?: unknown;
      };
      // Legacy .bundle.json — passed straight through.
      if (v.bundleVersion) return { body: v };
      // The coach's self-contained JSON: { raw, analysis, playedAt? }.
      if (typeof v.raw === 'string') {
        return {
          body: { ...v, playedAt: v.playedAt ?? fromLocalInputValue(playedAt) },
        };
      }
      // An analysis alone has no log to attach to — the JSON must embed `raw`.
      if (v.analysis || v.moments) return { error: t('importJsonNeedsRaw') };
      return { error: t('importBadJson') };
    }
    // Not JSON: the battle log itself, imported without annotations.
    return { body: { raw: input, playedAt: fromLocalInputValue(playedAt) } };
  };

  const submit = async (input: string) => {
    if (!input.trim()) return;
    setBusy(true);
    setError(null);
    setDetails([]);
    try {
      const payload = toPayload(input);
      if ('error' in payload) {
        setError(payload.error);
        return;
      }
      sessionStorage.setItem(DRAFT, JSON.stringify({ text, playedAt }));
      const res = await fetch('/api/ptcg/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload.body),
      });
      if (!res.ok) return void (await fail(res));
      const { game } = (await res.json()) as { game: { id: string } };
      sessionStorage.removeItem(DRAFT);
      router.push(`/ptcg/${game.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="border-border bg-surface rounded-xl border p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('importPlaceholder')}
          spellCheck={false}
          className="border-border bg-surface-2 focus:border-red h-48 w-full rounded-lg border p-3 font-mono text-xs outline-none"
        />
        <p className="text-text-muted mt-2 text-xs leading-relaxed">{t('importHint')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="text-text-muted flex items-center gap-2 text-xs">
            {t('importPlayedAt')}
            <input
              type="datetime-local"
              value={playedAt}
              max={now()}
              onChange={(e) => setPlayedAt(e.target.value)}
              className="border-border bg-surface-2 rounded-lg border px-2 py-1.5 text-xs"
            />
          </label>
          <button
            type="button"
            onClick={() => void submit(text)}
            disabled={!text.trim() || busy}
            className="bg-red ml-auto rounded-lg px-5 py-2 text-sm font-semibold text-white transition disabled:opacity-40"
          >
            {busy ? t('uploading') : t('importSubmit')}
          </button>
        </div>
      </section>

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

      {/* A dropped file is the desktop path for the coach's JSON; on a phone,
          pasting into the same box above does the job. */}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) await submit(await f.text());
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="border-border hover:border-red/50 flex w-full flex-col items-center gap-2 rounded-xl border border-dashed py-6 transition disabled:opacity-40"
      >
        {busy ? <Pokeball size={32} /> : <Upload className="text-text-muted h-6 w-6" aria-hidden />}
        <span className="text-sm font-semibold">{t('importDropJson')}</span>
      </button>
    </div>
  );
}
