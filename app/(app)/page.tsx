export const metadata = {
  title: 'Dashboard — I.R.I.S',
};

export default function DashboardPage() {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="text-text-muted mt-1 text-sm">
        KPIs, top 10 cartes rares et alertes restock arriveront en Phase 4.
      </p>

      <div className="bg-surface border-border mt-6 rounded-lg border p-6">
        <p className="text-text-faint font-mono text-xs">
          Phase 1 en cours — utilise la nav pour explorer Scanner, Pokédex et Vinted.
        </p>
      </div>
    </section>
  );
}
