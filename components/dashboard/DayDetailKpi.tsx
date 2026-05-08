'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { DayDetail } from '@/lib/utils/dashboard-queries';

interface Props {
  /** Map of date (YYYY-MM-DD) → DayDetail. Days without activity may be absent. */
  details: Record<string, DayDetail>;
  /** "Today" anchor — day to start at. ISO YYYY-MM-DD. */
  today: string;
  /** How many days back the user can navigate. Default 24*7 = 168 (matches heatmap). */
  maxDaysBack?: number;
}

const DOWS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  return `${DOWS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export default function DayDetailKpi({ details, today, maxDaysBack = 168 }: Props) {
  const [date, setDate] = useState(today);
  const detail = details[date];
  const minDate = shiftDate(today, -maxDaysBack);

  const canGoBack = date > minDate;
  const canGoForward = date < today;

  function goBack() {
    if (canGoBack) setDate(shiftDate(date, -1));
  }
  function goForward() {
    if (canGoForward) setDate(shiftDate(date, 1));
  }

  return (
    <div className="bg-surface border-border rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={goBack}
          disabled={!canGoBack}
          aria-label="Jour précédent"
          className="text-text-muted hover:bg-surface-2 hover:text-text rounded-md p-1.5 transition-colors disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-text text-sm font-semibold">{formatDate(date)}</div>
        <button
          type="button"
          onClick={goForward}
          disabled={!canGoForward}
          aria-label="Jour suivant"
          className="text-text-muted hover:bg-surface-2 hover:text-text rounded-md p-1.5 transition-colors disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="OCR" value={String(detail?.ocrCount ?? 0)} sub={detail ? `${detail.geminiCount}G · ${detail.visionCount}V` : '—'} />
        <Stat label="Cartes ajoutées" value={String(detail?.cardsAdded ?? 0)} />
        <Stat label="Coût" value={detail ? `€${detail.costEur.toFixed(2)}` : '€0.00'} />
        <Stat label="Tokens" value={detail ? `${(detail.tokensTotal / 1000).toFixed(1)}K` : '0K'} />
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="text-center">
      <div className="text-text-muted text-xs uppercase tracking-wide">{label}</div>
      <div className="text-text mt-1 text-lg font-semibold">{value}</div>
      {sub && <div className="text-text-faint text-xs">{sub}</div>}
    </div>
  );
}
