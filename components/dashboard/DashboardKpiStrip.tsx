interface Props {
  valueStock: number;
  cost30d: number;
  scans30d: number;
}

function formatEur(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(n);
}

export default function DashboardKpiStrip({
  valueStock,
  cost30d,
  scans30d,
}: Props) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile label="Valeur stock" value={formatEur(valueStock)} />
      <Tile label="Coût OCR 30j" value={formatEur(cost30d)} />
      <Tile label="Scans 30j" value={String(scans30d)} />
      <Tile label="Restock alerts" value="—" />
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border-border rounded-lg border p-4">
      <div className="text-text-muted text-xs uppercase tracking-wide">{label}</div>
      <div className="text-text mt-1.5 text-xl font-semibold">{value}</div>
    </div>
  );
}
