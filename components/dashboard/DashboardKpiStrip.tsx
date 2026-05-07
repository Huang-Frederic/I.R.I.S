// components/dashboard/DashboardKpiStrip.tsx
import Link from 'next/link';
import Sparkline from './Sparkline';

interface TileData {
  label: string;
  value: string;
  href: string;
  series?: readonly number[];
  delta?: number | null;
}

interface Props {
  valueStock: TileData;
  cost: TileData;
  scans: TileData;
  restock: TileData;
}

function deltaText(d: number | null | undefined): { text: string; positive: boolean | null } {
  if (d == null) return { text: '—', positive: null };
  const sign = d > 0 ? '+' : '';
  const positive = d === 0 ? null : d > 0;
  return { text: `${sign}${d.toFixed(0)}%`, positive };
}

function Tile({ tile }: { tile: TileData }) {
  const { text: deltaTxt, positive } = deltaText(tile.delta);
  return (
    <Link
      href={tile.href}
      className="bg-surface border-border hover:border-text-faint rounded-lg border p-4 transition-colors block"
    >
      <div className="text-text-muted text-xs uppercase tracking-wide">{tile.label}</div>
      <div className="text-text mt-1.5 text-xl font-semibold">{tile.value}</div>
      <div className="mt-2 flex items-center gap-2">
        {tile.series && tile.series.length > 0 && (
          <Sparkline series={tile.series} positive={positive} />
        )}
        <span
          className={`text-[10px] font-medium ${
            positive === true ? 'text-rarity-r' : positive === false ? 'text-red' : 'text-text-faint'
          }`}
        >
          {deltaTxt}
        </span>
      </div>
    </Link>
  );
}

export default function DashboardKpiStrip(props: Props) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile tile={props.valueStock} />
      <Tile tile={props.cost} />
      <Tile tile={props.scans} />
      <Tile tile={props.restock} />
    </div>
  );
}
