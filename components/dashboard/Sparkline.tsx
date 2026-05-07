// components/dashboard/Sparkline.tsx

interface Props {
  series: readonly number[]; // 7 points
  positive?: boolean | null; // green if true, red if false, gray if null
  className?: string;
}

export default function Sparkline({ series, positive, className }: Props) {
  if (series.length === 0) return null;
  const max = Math.max(...series, 1);
  const W = 60;
  const H = 16;
  const stepX = W / Math.max(1, series.length - 1);
  const points = series.map((v, i) => `${i * stepX},${H - (v / max) * H}`).join(' ');
  const stroke = positive === true ? '#88c45f' : positive === false ? '#e35a5a' : '#888';
  return (
    <svg width={W} height={H} className={className} aria-hidden>
      <polyline points={points} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
