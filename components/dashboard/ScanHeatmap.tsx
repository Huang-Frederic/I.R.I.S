// components/dashboard/ScanHeatmap.tsx
'use client';
import { useState } from 'react';
import type { DayDetail } from '@/lib/utils/dashboard-queries';

interface Props {
  matrix: number[][]; // weeks × 7 days
  details?: Record<string, DayDetail>;
}

const CELL = 14;
const GAP = 3;
const LABEL_WIDTH = 16;
const DOW_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function colorFor(count: number, max: number): string {
  if (count === 0) return 'var(--color-surface-2, #2a2a28)';
  const ratio = max === 0 ? 0 : count / max;
  if (ratio > 0.66) return '#5591c7';
  if (ratio > 0.33) return '#5591c7aa';
  return '#5591c755';
}

/**
 * Computes the date for cell (w, d). Returns YYYY-MM-DD UTC.
 * weeksAgo is 0 for current week, 1 for last week, etc.
 * dow is 0 for Monday, 6 for Sunday.
 */
function computeDateForCell(weeksAgo: number, dow: number): string {
  const now = new Date();
  const anchorDay = (now.getUTCDay() + 6) % 7; // 0 = Mon
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - anchorDay));
  const ms = monday.getTime() - weeksAgo * 7 * 86_400_000 + dow * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

interface HoverState {
  x: number;
  y: number;
  detail: DayDetail | null;
  date: string;
}

export default function ScanHeatmap({ matrix, details = {} }: Props) {
  const [hover, setHover] = useState<HoverState | null>(null);
  const weeks = matrix.length;
  const max = Math.max(...matrix.flat(), 1);
  const width = weeks * (CELL + GAP) + LABEL_WIDTH;
  const height = 7 * (CELL + GAP);

  return (
    <div className="bg-surface border-border rounded-lg border p-4">
      <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
        Activité scans ({weeks} semaines)
      </h3>
      <div className="relative flex justify-center overflow-x-auto">
        <svg width={width} height={height} role="img" aria-label="Carte d'activité des scans">
          {DOW_LABELS.map((lbl, dow) => (
            <text
              key={dow}
              x={4}
              y={dow * (CELL + GAP) + CELL - 2}
              fontSize={10}
              fill="currentColor"
              opacity={0.5}
            >
              {lbl}
            </text>
          ))}
          {matrix.map((week, w) =>
            week.map((count, d) => {
              const x = LABEL_WIDTH + (weeks - 1 - w) * (CELL + GAP);
              const y = d * (CELL + GAP);
              return (
                <rect
                  key={`${w}-${d}`}
                  x={x}
                  y={y}
                  width={CELL}
                  height={CELL}
                  fill={colorFor(count, max)}
                  rx={2}
                  className="cursor-default"
                  onMouseEnter={() => {
                    const date = computeDateForCell(w, d);
                    setHover({
                      x: x + CELL / 2,
                      y,
                      date,
                      detail: details[date] ?? null,
                    });
                  }}
                  onMouseLeave={() => setHover(null)}
                />
              );
            }),
          )}
        </svg>

        {hover && (
          <HoverTooltip
            x={hover.x}
            y={hover.y}
            date={hover.date}
            detail={hover.detail}
          />
        )}
      </div>
    </div>
  );
}

function HoverTooltip({ x, y, date, detail }: { x: number; y: number; date: string; detail: DayDetail | null }) {
  const formatted = formatShortDate(date);
  return (
    <div
      role="tooltip"
      className="bg-surface border-border pointer-events-none absolute z-20 rounded-md border px-3 py-2 text-xs shadow-lg"
      style={{
        left: x,
        top: y - 8,
        transform: 'translate(-50%, -100%)',
        minWidth: '180px',
      }}
    >
      <div className="text-text font-semibold">{formatted}</div>
      {detail && detail.ocrCount > 0 ? (
        <ul className="text-text-muted mt-1 space-y-0.5">
          <li>
            <span className="text-text">{detail.ocrCount}</span> OCR
            <span className="text-text-faint">
              {' '}({detail.geminiCount} G · {detail.visionCount} V)
            </span>
          </li>
          <li>
            <span className="text-text">{detail.cardsAdded}</span> cartes ajoutées
          </li>
          <li>
            <span className="text-text">€{detail.costEur.toFixed(4)}</span> coût
          </li>
          <li>
            <span className="text-text">{(detail.tokensTotal / 1000).toFixed(1)}K</span> tokens
          </li>
        </ul>
      ) : (
        <p className="text-text-faint mt-1">Aucune activité</p>
      )}
    </div>
  );
}

function formatShortDate(iso: string): string {
  const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const dows = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const d = new Date(iso + 'T12:00:00Z'); // UTC noon to avoid TZ flip
  return `${dows[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}
