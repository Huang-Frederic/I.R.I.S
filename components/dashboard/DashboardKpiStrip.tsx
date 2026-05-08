interface TileData {
  label: string;
  value: string;
}

interface Props {
  valueStock: TileData;
  cost: TileData;
  scans: TileData;
  cardsAdded: TileData;
}

function Tile({ tile }: { tile: TileData }) {
  return (
    <div className="bg-surface border-border rounded-lg border p-4">
      <div className="text-text-muted text-xs uppercase tracking-wide">{tile.label}</div>
      <div className="text-text mt-1.5 text-xl font-semibold">{tile.value}</div>
    </div>
  );
}

export default function DashboardKpiStrip(props: Props) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile tile={props.valueStock} />
      <Tile tile={props.cost} />
      <Tile tile={props.scans} />
      <Tile tile={props.cardsAdded} />
    </div>
  );
}
