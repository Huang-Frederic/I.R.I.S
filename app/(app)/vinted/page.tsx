export const metadata = {
  title: 'Vinted — I.R.I.S',
};

export default function VintedPage() {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Vinted</h1>
      <p className="text-text-muted mt-1 text-sm">
        Stock à vendre en FIFO + générateur d&apos;annonce.
      </p>

      <div className="bg-surface border-border mt-6 rounded-lg border p-6">
        <p className="text-text-faint font-mono text-xs">Liste, recherche et générateur arrivent en Phase 2.</p>
      </div>
    </section>
  );
}
