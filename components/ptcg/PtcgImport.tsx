'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, Copy, Download, TriangleAlert } from 'lucide-react';
import Pokeball from '@/components/ui/Pokeball';
import { parseJsonLoose } from '@/lib/utils/json-from-text';

/** Survives a refresh: re-exporting a log from PTCG Live is not possible, and
 *  losing a paste to a stray reload would mean losing the game. */
const DRAFT = 'ptcg-import-draft';

interface Summary {
  me: string;
  opponent: string;
  result: 'win' | 'loss' | 'tie';
  prizesMe: number;
  prizesOpponent: number;
  turns: number;
  logHash: string;
  checksPassed: number;
}

interface Parsed {
  digest: unknown;
  summary: Summary;
  unknown: { line: number; text: string }[];
  unresolved: string[];
}

const today = () => new Date().toISOString().slice(0, 10);

export default function PtcgImport() {
  const t = useTranslations('ptcg');
  const tErrors = useTranslations('errors');
  const router = useRouter();

  const [raw, setRaw] = useState('');
  const [playedAt, setPlayedAt] = useState(today());
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [busy, setBusy] = useState<'parse' | 'import' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);
  const [pasted, setPasted] = useState('');
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem(DRAFT);
    if (saved) {
      try {
        const d = JSON.parse(saved) as { raw: string; playedAt: string };
        setRaw(d.raw);
        setPlayedAt(d.playedAt || today());
      } catch {
        sessionStorage.removeItem(DRAFT);
      }
    }
  }, []);

  const fail = useCallback(
    async (res: Response) => {
      const body = await res.json().catch(() => ({}));
      const code = body?.error ?? 'server_error';
      setError(tErrors.has(code) ? tErrors(code) : (body?.message ?? code));
      const d = body?.details;
      // Every failure mode names what actually went wrong. A count on its own
      // — "67 lines were not recognised" — is something the reader can neither
      // act on nor report.
      setDetails(
        Array.isArray(d?.errors)
          ? d.errors
          : Array.isArray(d?.checks)
            ? d.checks.map(
                (c: { kind: string; detail: string; expected: unknown; got: unknown }) =>
                  `${c.kind} — ${c.detail} (attendu ${String(c.expected)}, obtenu ${String(c.got)})`,
              )
            : Array.isArray(d?.unknown)
              ? d.unknown.map((u: { line: number; text: string }) => `L${u.line}  ${u.text}`)
              : d?.underlying
                ? [String(d.underlying)]
                : [],
      );
    },
    [tErrors],
  );

  const parse = async () => {
    setBusy('parse');
    setError(null);
    setDetails([]);
    setParsed(null);
    try {
      const res = await fetch('/api/ptcg/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw, playedAt }),
      });
      if (!res.ok) return void (await fail(res));
      setParsed((await res.json()) as Parsed);
      sessionStorage.setItem(DRAFT, JSON.stringify({ raw, playedAt }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const download = () => {
    if (!parsed) return;
    const blob = new Blob([JSON.stringify(parsed.digest, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${playedAt}-${parsed.summary.opponent}.digest.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const copy = async () => {
    if (!parsed) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(parsed.digest));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked outside a secure context; the download still works.
      setError(t('importCopyFailed'));
    }
  };

  const importAnalysis = async (text: string) => {
    setBusy('import');
    setError(null);
    setDetails([]);
    try {
      const read = parseJsonLoose(text);
      if (!read.ok) {
        setError(t('importBadJson'));
        return;
      }
      const analysis = read.value;
      const res = await fetch('/api/ptcg/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // A file carrying a whole bundle is passed straight through; anything
        // else is treated as the analysis and assembled against this log.
        body: JSON.stringify(
          (analysis as { bundleVersion?: string })?.bundleVersion
            ? analysis
            : { raw, analysis, playedAt },
        ),
      });
      if (!res.ok) return void (await fail(res));
      const { game } = (await res.json()) as { game: { id: string } };
      sessionStorage.removeItem(DRAFT);
      router.push(`/ptcg/${game.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Step 1 — the log ------------------------------------------------- */}
      <section className="border-border bg-surface rounded-xl border p-4">
        <Step n={1} title={t('importStep1')} />
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={t('importPlaceholder')}
          spellCheck={false}
          className="border-border bg-surface-2 focus:border-red mt-3 h-40 w-full rounded-lg border p-3 font-mono text-xs outline-none"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="text-text-muted flex items-center gap-2 text-xs">
            {t('importPlayedAt')}
            <input
              type="date"
              value={playedAt}
              max={today()}
              onChange={(e) => setPlayedAt(e.target.value)}
              className="border-border bg-surface-2 rounded-lg border px-2 py-1.5 text-xs"
            />
          </label>
          <button
            type="button"
            onClick={parse}
            disabled={!raw.trim() || busy !== null}
            className="bg-red ml-auto rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-40"
          >
            {busy === 'parse' ? t('importParsing') : t('importParse')}
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

      {parsed && (
        <>
          {/* Step 2 — the digest ------------------------------------------ */}
          <section className="border-border bg-surface rounded-xl border p-4">
            <Step n={2} title={t('importStep2')} />

            <div className="border-border bg-surface-2 mt-3 rounded-lg border p-3">
              <p className="text-sm font-semibold">
                {parsed.summary.me} vs {parsed.summary.opponent}
                <span className="text-text-muted ml-2 font-normal tabular-nums">
                  {t(`result_${parsed.summary.result}` as 'result_win')} {parsed.summary.prizesMe}–
                  {parsed.summary.prizesOpponent} ·{' '}
                  {t('turnsCount', { count: parsed.summary.turns })}
                </span>
              </p>
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-500">
                <Check className="h-3.5 w-3.5" aria-hidden />
                {t('importChecksPassed', { count: parsed.summary.checksPassed })}
              </p>
              {(parsed.unknown.length > 0 || parsed.unresolved.length > 0) && (
                <div className="mt-2 flex flex-col gap-1 text-xs text-amber-500">
                  {parsed.unknown.length > 0 && (
                    <p className="flex items-start gap-1.5">
                      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      {t('importUnknownLines', { count: parsed.unknown.length })}
                    </p>
                  )}
                  {parsed.unresolved.length > 0 && (
                    <p className="flex items-start gap-1.5">
                      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      {t('importUnresolved', { cards: parsed.unresolved.join(', ') })}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Copy sits beside download for phones, where saving a file and
                finding it again in a picker is the whole friction. */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={download}
                className="border-border bg-surface-2 hover:bg-surface flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-semibold"
              >
                <Download className="h-4 w-4" aria-hidden />
                {t('importDownload')}
              </button>
              <button
                type="button"
                onClick={copy}
                className="border-border bg-surface-2 hover:bg-surface flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-semibold"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-500" aria-hidden />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden />
                )}
                {copied ? t('importCopied') : t('importCopy')}
              </button>
            </div>
            <p className="text-text-muted mt-2 text-xs leading-relaxed">{t('importDigestHint')}</p>
          </section>

          {/* Step 3 — the analysis back ----------------------------------- */}
          <section className="border-border bg-surface rounded-xl border p-4">
            <Step n={3} title={t('importStep3')} />
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) await importAnalysis(await f.text());
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy !== null}
              className="border-border hover:border-red/50 mt-3 flex w-full flex-col items-center gap-2 rounded-lg border border-dashed py-6 transition disabled:opacity-40"
            >
              <Pokeball size={32} />
              <span className="text-sm font-semibold">
                {busy === 'import' ? t('uploading') : t('importDropAnalysis')}
              </span>
            </button>

            {/* Pasting is the only workable path on a phone: the analysis
                arrives as text in a conversation, and turning that into a file
                just to hand it back is two detours through a file manager. */}
            <p className="text-text-muted my-3 text-center text-xs">{t('importOrPaste')}</p>
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={t('importPastePlaceholder')}
              spellCheck={false}
              className="border-border bg-surface-2 focus:border-red h-24 w-full rounded-lg border p-3 font-mono text-xs outline-none"
            />
            <button
              type="button"
              onClick={() => void importAnalysis(pasted)}
              disabled={!pasted.trim() || busy !== null}
              className="bg-red mt-2 w-full rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy === 'import' ? t('uploading') : t('importSubmitPasted')}
            </button>
          </section>
        </>
      )}
    </div>
  );
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="flex items-center gap-2.5 text-sm font-semibold">
      <span
        className="bg-red/15 text-red flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums"
        aria-hidden
      >
        {n}
      </span>
      {title}
    </h2>
  );
}
