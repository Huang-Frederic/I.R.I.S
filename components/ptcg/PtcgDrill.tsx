'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Flame, RotateCcw, Home, Timer, Layers } from 'lucide-react';
import { DRILL_DECK, DRILL_TARGET_IDS, type DrillCard } from '@/lib/ptcg/drill-deck';

/** One physical copy in the shuffled pool. */
interface Copy {
  id: string;
  name: string;
  category: DrillCard['category'];
}

type Mode = 'std' | 'real';
type View = 'home' | 'loading' | 'scan' | 'answer' | 'result';

interface RunRecord {
  m: Mode;
  score: number;
  time: number;
}

/** v2: the target list changed (7 counts) — old 10-count records don't compare. */
const STORAGE = 'iris-drill-425-v2';
const LIMIT = 45;
/** Cards per fan packet — roughly what a hand holds while riffling a deck. */
const PACKET = 5;

const loadRuns = (): { runs: RunRecord[]; streak: number } => {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE) ?? '');
    if (v && Array.isArray(v.runs)) return { runs: v.runs, streak: v.streak ?? 0 };
  } catch {
    /* first visit */
  }
  return { runs: [], streak: 0 };
};

export default function PtcgDrill({ images }: { images: Record<string, string> }) {
  const t = useTranslations('drill');

  const pool = useMemo<Copy[]>(
    () =>
      DRILL_DECK.flatMap((c) =>
        Array.from({ length: c.count }, () => ({ id: c.id, name: c.name, category: c.category })),
      ),
    [],
  );
  const targets = useMemo(
    () => DRILL_TARGET_IDS.map((id) => DRILL_DECK.find((c) => c.id === id)!),
    [],
  );

  const [view, setView] = useState<View>('home');
  const [mode, setMode] = useState<Mode>('std');
  const [prizes, setPrizes] = useState<Copy[]>([]);
  const [hand, setHand] = useState<Copy[]>([]);
  const [deckShown, setDeckShown] = useState<Copy[]>([]);
  const [packetIdx, setPacketIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [records, setRecords] = useState<{ runs: RunRecord[]; streak: number }>({ runs: [], streak: 0 });
  const [loaded, setLoaded] = useState(0);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const startRef = useRef(0);
  const preloadedRef = useRef(false);

  // localStorage is client-only; hydrate the records after mount.
  useEffect(() => {
    const id = setTimeout(() => setRecords(loadRuns()), 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed((performance.now() - startRef.current) / 1000), 100);
    return () => clearInterval(id);
  }, [running]);

  /** Resolves once every unique card image is either cached or known-broken.
   *  The run must not start with holes in the fan — a missing Bracelet mid-scan
   *  reads as a bug, not as a card. */
  const preload = useCallback(async (): Promise<Set<string>> => {
    const unique = [...new Set(DRILL_DECK.map((c) => c.id))];
    const failed = new Set<string>();
    let done = 0;
    setLoaded(0);
    await Promise.all(
      unique.map(
        (id) =>
          new Promise<void>((resolve) => {
            const url = images[id];
            const finish = (ok: boolean) => {
              if (!ok) failed.add(id);
              done += 1;
              setLoaded(done);
              resolve();
            };
            if (!url) return finish(false);
            const img = new window.Image();
            const timeout = setTimeout(() => finish(false), 8000);
            img.onload = () => {
              clearTimeout(timeout);
              finish(true);
            };
            img.onerror = () => {
              clearTimeout(timeout);
              finish(false);
            };
            img.src = `${url}/low.webp`;
          }),
      ),
    );
    return failed;
  }, [images]);

  const start = useCallback(
    async (m: Mode) => {
      const shuffled = [...pool];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const h = m === 'real' ? shuffled.slice(0, 7) : [];
      setMode(m);
      setHand(h);
      setPrizes(shuffled.slice(h.length, h.length + 6));
      setDeckShown(shuffled.slice(h.length + 6));
      setAnswers({});
      setPacketIdx(0);
      setElapsed(0);
      // Gate on the images: the timer only starts once every card can render.
      if (!preloadedRef.current) {
        setView('loading');
        setBroken(await preload());
        preloadedRef.current = true;
      }
      startRef.current = performance.now();
      setRunning(true);
      setView('scan');
      window.scrollTo(0, 0);
    },
    [pool, preload],
  );

  const finishScan = () => {
    setRunning(false);
    setElapsed((performance.now() - startRef.current) / 1000);
    setView('answer');
    window.scrollTo(0, 0);
  };

  const truthOf = useCallback(
    (id: string) => prizes.filter((p) => p.id === id).length,
    [prizes],
  );

  const score = targets.reduce((s, c) => s + (answers[c.id] === truthOf(c.id) ? 1 : 0), 0);
  const inTime = elapsed <= LIMIT;

  const submit = () => {
    const perfect = score === targets.length && inTime;
    const next = {
      runs: [{ m: mode, score, time: +elapsed.toFixed(1) }, ...records.runs].slice(0, 8),
      streak: perfect ? records.streak + 1 : 0,
    };
    setRecords(next);
    try {
      localStorage.setItem(STORAGE, JSON.stringify(next));
    } catch {
      /* private mode */
    }
    setView('result');
    window.scrollTo(0, 0);
  };

  const left = LIMIT - elapsed;
  const best = records.runs.filter((r) => r.score === targets.length).sort((a, b) => a.time - b.time)[0];
  const perfects = records.runs.filter((r) => r.score === targets.length && r.time <= LIMIT).length;

  const packets = useMemo(() => {
    const out: Copy[][] = [];
    for (let i = 0; i < deckShown.length; i += PACKET) out.push(deckShown.slice(i, i + PACKET));
    return out;
  }, [deckShown]);
  const fanDone = packetIdx >= packets.length;
  const seen = Math.min(packetIdx * PACKET, deckShown.length);

  /* ---------------------------------------------------------------- tiles */
  const Tile = ({ c, small }: { c: Copy; small?: boolean }) => {
    const url = images[c.id];
    return url && !broken.has(c.id) ? (
      <Image
        src={`${url}/low.webp`}
        alt={c.name}
        width={small ? 60 : 86}
        height={small ? 84 : 120}
        loading="lazy"
        unoptimized
        className="h-auto w-full rounded-[4.5%] shadow-sm"
      />
    ) : (
      <div
        className={`border-border bg-surface-2 flex aspect-[63/88] w-full flex-col justify-between rounded-md border p-1.5 ${small ? 'text-[9px]' : 'text-[11px]'}`}
      >
        <span className="leading-tight font-semibold break-words">{c.name}</span>
        <span className="text-text-faint text-[8px] tracking-wide uppercase">
          {t(`cat_${c.category}` as 'cat_poke')}
        </span>
      </div>
    );
  };

  /** A fan card — bigger art, held-in-hand angle. */
  const FanCard = ({ c, i, n }: { c: Copy; i: number; n: number }) => {
    const mid = (n - 1) / 2;
    const url = images[c.id];
    return (
      <div
        className="absolute bottom-3 left-1/2 w-40 select-none motion-safe:transition-transform sm:w-48"
        style={{
          transform: `translateX(calc(-50% + ${(i - mid) * 54}px)) rotate(${(i - mid) * 7}deg)`,
          transformOrigin: 'bottom center',
          zIndex: i,
        }}
      >
        {url && !broken.has(c.id) ? (
          <Image
            src={`${url}/low.webp`}
            alt={c.name}
            width={245}
            height={337}
            unoptimized
            className="h-auto w-full rounded-[4.5%] shadow-lg"
          />
        ) : (
          <div className="border-border bg-surface-2 flex aspect-[63/88] w-full flex-col justify-between rounded-lg border-2 p-3 shadow-lg">
            <span className="text-sm leading-tight font-bold break-words">{c.name}</span>
            <span className="text-text-faint text-[10px] tracking-wide uppercase">
              {t(`cat_${c.category}` as 'cat_poke')}
            </span>
          </div>
        )}
      </div>
    );
  };

  /* ---------------------------------------------------------------- views */
  if (view === 'home') {
    return (
      <div className="flex flex-col gap-4">
        <div className="border-border bg-surface rounded-xl border p-4">
          <h2 className="text-text-muted text-xs font-semibold tracking-wide uppercase">
            {t('objectiveTitle')}
          </h2>
          <p className="mt-2 text-sm leading-relaxed">{t('objective', { seconds: LIMIT })}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => void start('std')}
            className="bg-red rounded-xl px-4 py-4 text-left text-white transition hover:opacity-90"
          >
            <span className="block text-[15px] font-bold">{t('modeStandard')}</span>
            <span className="text-[12px] opacity-85">{t('modeStandardHint')}</span>
          </button>
          <button
            type="button"
            onClick={() => void start('real')}
            className="border-border bg-surface hover:border-red/50 rounded-xl border px-4 py-4 text-left transition"
          >
            <span className="block text-[15px] font-bold">{t('modeReal')}</span>
            <span className="text-text-muted text-[12px]">{t('modeRealHint')}</span>
          </button>
        </div>

        <div className="border-border bg-surface rounded-xl border p-4">
          <h2 className="text-text-muted text-xs font-semibold tracking-wide uppercase">
            {t('recordsTitle')}
          </h2>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div className="border-border bg-surface-2 rounded-lg border px-2 py-3">
              <p className="text-text-muted text-[11px]">{t('recordPerfects')}</p>
              <p className="font-mono text-2xl font-bold tabular-nums">{perfects}</p>
            </div>
            <div className="border-border bg-surface-2 rounded-lg border px-2 py-3">
              <p className="text-text-muted text-[11px]">{t('recordBest')}</p>
              <p className="font-mono text-2xl font-bold tabular-nums">
                {best ? `${best.time.toFixed(1)}s` : '—'}
              </p>
            </div>
            <div className="border-border bg-surface-2 rounded-lg border px-2 py-3">
              <p className="text-text-muted text-[11px]">{t('recordStreak')}</p>
              <p className="font-mono text-2xl font-bold tabular-nums">{records.streak}</p>
            </div>
          </div>
          {records.runs.length > 0 && (
            <ul className="divide-border mt-3 divide-y text-sm">
              {records.runs.map((r, i) => (
                <li key={i} className="flex items-center justify-between py-1.5">
                  <span className="text-text-muted">
                    {r.m === 'real' ? t('modeReal') : t('modeStandard')}
                  </span>
                  <span className="font-mono tabular-nums">
                    {r.score}/{targets.length}
                    <span className={`ml-3 ${r.time <= LIMIT ? 'text-emerald-500' : 'text-red'}`}>
                      {r.time.toFixed(1)}s
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-border bg-surface rounded-xl border p-4">
          <h2 className="text-text-muted text-xs font-semibold tracking-wide uppercase">
            {t('planTitle')}
          </h2>
          <ol className="text-text-muted mt-2 list-inside list-decimal space-y-1 text-[13px]">
            <li>{t('plan1')}</li>
            <li>{t('plan2', { seconds: LIMIT })}</li>
            <li>{t('plan3')}</li>
          </ol>
        </div>
      </div>
    );
  }

  if (view === 'loading') {
    const total = new Set(DRILL_DECK.map((c) => c.id)).size;
    return (
      <div className="border-border bg-surface flex flex-col items-center gap-3 rounded-xl border px-4 py-12">
        <Layers className="text-red h-8 w-8 motion-safe:animate-pulse" aria-hidden />
        <p className="text-sm font-semibold">{t('loadingCards', { done: loaded, total })}</p>
        <div className="bg-surface-2 h-1.5 w-56 overflow-hidden rounded-full">
          <div
            className="bg-red h-full rounded-full motion-safe:transition-all"
            style={{ width: `${(loaded / total) * 100}%` }}
          />
        </div>
      </div>
    );
  }

  if (view === 'scan') {
    const current = packets[packetIdx] ?? [];
    return (
      <div>
        <div className="bg-bg border-border sticky top-0 z-10 -mx-1 flex items-center gap-3 border-b px-1 py-2.5">
          <Timer className={`h-5 w-5 ${left <= 10 ? 'text-red' : 'text-text-muted'}`} aria-hidden />
          <span
            className={`font-mono text-3xl font-bold tabular-nums ${
              left < 0 ? 'text-red' : left <= 10 ? 'text-red motion-safe:animate-pulse' : ''
            }`}
          >
            {left < 0 ? `+${(-left).toFixed(1)}` : left.toFixed(1)}
          </span>
          <span className="text-text-muted font-mono text-xs tabular-nums">
            {t('fanSeen', { seen, total: deckShown.length })}
          </span>
          <button
            type="button"
            onClick={finishScan}
            className="bg-red ml-auto rounded-lg px-4 py-2 text-sm font-semibold text-white"
          >
            {t('finishScan')}
          </button>
        </div>

        {mode === 'real' && (
          <div className="mt-3">
            <p className="text-text-muted text-xs font-semibold tracking-wide uppercase">
              {t('handLabel')}
            </p>
            <div className="mt-1.5 grid grid-cols-7 gap-1.5">
              {hand.map((c, i) => (
                <Tile key={i} c={c} small />
              ))}
            </div>
          </div>
        )}

        {fanDone ? (
          <div className="border-border bg-surface mt-4 flex flex-col items-center gap-4 rounded-xl border px-4 py-14">
            <p className="text-sm font-semibold">{t('fanDone')}</p>
            <button
              type="button"
              onClick={finishScan}
              className="bg-red rounded-xl px-6 py-3 text-sm font-bold text-white"
            >
              {t('makeAnswer')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPacketIdx((p) => p + 1)}
            aria-label={t('fanTap')}
            className="relative mt-2 block h-[320px] w-full cursor-pointer overflow-hidden rounded-xl sm:h-[380px]"
          >
            {current.map((c, i) => (
              <FanCard key={`${packetIdx}-${i}`} c={c} i={i} n={current.length} />
            ))}
            <span className="text-text-faint absolute right-0 bottom-2 left-0 text-center text-xs">
              {t('fanTap')}
            </span>
          </button>
        )}
      </div>
    );
  }

  if (view === 'answer') {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-text-muted text-sm">
          {t('scanTime', { time: elapsed.toFixed(1) })}{' '}
          {inTime ? '✓' : <span className="text-red">{t('overtime')}</span>}
        </p>

        {mode === 'real' && (
          <div>
            <p className="text-text-muted mb-1.5 text-xs font-semibold tracking-wide uppercase">
              {t('handLabel')}
            </p>
            <div className="grid grid-cols-7 gap-1.5">
              {hand.map((c, i) => (
                <Tile key={i} c={c} small />
              ))}
            </div>
          </div>
        )}

        <div className="border-border bg-surface divide-border divide-y rounded-xl border px-4">
          {targets.map((c) => {
            const inHand = hand.filter((h) => h.id === c.id).length;
            const max = Math.min(c.count, 4);
            return (
              <div key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{c.name}</p>
                  <p className="text-text-faint text-[11px]">
                    {t('totalOf', { count: c.count })}
                    {mode === 'real' && inHand > 0 && ` · ${t('inHand', { count: inHand })}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {Array.from({ length: max + 1 }, (_, v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={answers[c.id] === v}
                      onClick={() => setAnswers((a) => ({ ...a, [c.id]: v }))}
                      className={`min-w-9 rounded-lg border px-0 py-2 font-mono text-sm font-bold transition ${
                        answers[c.id] === v
                          ? 'bg-red border-red text-white'
                          : 'border-border bg-surface-2 hover:border-red/50'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={submit}
          className="bg-red w-full rounded-xl py-3.5 text-sm font-bold text-white transition hover:opacity-90"
        >
          {t('verify')}
        </button>
      </div>
    );
  }

  /* result */
  const perfect = score === targets.length;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="border-border bg-surface rounded-xl border px-2 py-4">
          <p className="text-text-muted text-[11px] font-semibold tracking-wide uppercase">
            {t('scoreLabel')}
          </p>
          <p className="mt-1 font-mono text-4xl font-bold tabular-nums">
            {score}/{targets.length}
          </p>
        </div>
        <div className="border-border bg-surface rounded-xl border px-2 py-4">
          <p className="text-text-muted text-[11px] font-semibold tracking-wide uppercase">
            {t('scanLabel')}
          </p>
          <p
            className={`mt-1 font-mono text-4xl font-bold tabular-nums ${inTime ? 'text-emerald-500' : 'text-red'}`}
          >
            {elapsed.toFixed(1)}s
          </p>
        </div>
      </div>

      {perfect && inTime && (
        <p className="text-red flex items-center justify-center gap-2 text-sm font-bold">
          <Flame className="h-4 w-4" aria-hidden /> {t('perfectInTime')}
        </p>
      )}

      <div className="border-border bg-surface divide-border divide-y rounded-xl border px-4">
        {targets.map((c) => {
          const truth = truthOf(c.id);
          const given = answers[c.id];
          const ok = given === truth;
          return (
            <div key={c.id} className="flex items-center justify-between py-2 text-sm">
              <span>{c.name}</span>
              <span
                className={`rounded-full px-2.5 py-0.5 font-mono text-[12px] font-bold ${
                  ok ? 'bg-emerald-500/15 text-emerald-500' : 'bg-red/15 text-red'
                }`}
              >
                {given ?? '—'} / {t('truth', { count: truth })}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-text-muted text-sm leading-relaxed">
        {perfect && inTime
          ? t('coachPerfectFast')
          : perfect
            ? t('coachPerfectSlow')
            : score >= targets.length - 2
              ? t('coachClose')
              : t('coachSignature')}
      </p>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => void start(mode)}
          className="bg-red flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white"
        >
          <RotateCcw className="h-4 w-4" aria-hidden /> {t('replay')}
        </button>
        <button
          type="button"
          onClick={() => setView('home')}
          className="border-border bg-surface flex flex-1 items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold"
        >
          <Home className="h-4 w-4" aria-hidden /> {t('backHome')}
        </button>
      </div>
    </div>
  );
}
