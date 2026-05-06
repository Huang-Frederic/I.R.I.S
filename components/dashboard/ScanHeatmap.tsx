// components/dashboard/ScanHeatmap.tsx
'use client';

interface Props {
  matrix: number[][]; // 52 weeks × 7 days
}

const CELL = 10;
const GAP = 2;
const DOW_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function colorFor(count: number, max: number): string {
  if (count === 0) return 'var(--color-surface-2, #2a2a28)';
  const ratio = max === 0 ? 0 : count / max;
  if (ratio > 0.66) return '#5591c7';
  if (ratio > 0.33) return '#5591c7aa';
  return '#5591c755';
}

export default function ScanHeatmap({ matrix }: Props) {
  const max = Math.max(...matrix.flat(), 1);
  const width = 52 * (CELL + GAP) + 16;
  const height = 7 * (CELL + GAP) + 16;

  return (
    <div className="bg-surface border-border rounded-lg border p-4">
      <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
        Activité scans (52 semaines)
      </h3>
      <div className="overflow-x-auto">
        <svg width={width} height={height} role="img" aria-label="Carte d'activité des scans">
          {DOW_LABELS.map((lbl, dow) => (
            <text
              key={dow}
              x={4}
              y={dow * (CELL + GAP) + CELL - 1}
              fontSize={8}
              fill="currentColor"
              opacity={0.5}
            >
              {lbl}
            </text>
          ))}
          {matrix.map((week, w) =>
            week.map((count, d) => (
              <rect
                key={`${w}-${d}`}
                x={16 + (51 - w) * (CELL + GAP)}
                y={d * (CELL + GAP)}
                width={CELL}
                height={CELL}
                fill={colorFor(count, max)}
                rx={2}
              >
                <title>{count} scans</title>
              </rect>
            )),
          )}
        </svg>
      </div>
    </div>
  );
}
