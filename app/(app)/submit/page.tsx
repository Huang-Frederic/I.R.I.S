export const metadata = {
  title: 'Scanner — I.R.I.S',
};

export default function SubmitPage() {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Scanner</h1>
      <p className="text-text-muted mt-1 text-sm">Photo, lot ou import script.</p>

      <div className="bg-surface border-border mt-6 rounded-lg border p-6">
        <p className="text-text-faint font-mono text-xs">
          Mode 1 (mobile rapide) à venir en Phase 1.7. Modes Lot et Script en Phase 3.
        </p>
      </div>
    </section>
  );
}
