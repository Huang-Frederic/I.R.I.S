export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
}

/**
 * Lightweight inline SVG sparkline. Avoids recharts' overhead for the /prices
 * list (potentially ~2000 sparklines). Color hints direction: green if up, red
 * if down, gray if flat.
 */
export function Sparkline({ values, width = 80, height = 20 }: SparklineProps) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const last = values[values.length - 1];
  const first = values[0];
  const stroke =
    last > first ? '#22c55e' : last < first ? '#ef4444' : '#9ca3af';

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline fill="none" stroke={stroke} strokeWidth="1.5" points={points} />
    </svg>
  );
}
