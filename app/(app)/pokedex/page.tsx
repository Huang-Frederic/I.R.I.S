export const metadata = {
  title: 'Pokédex — I.R.I.S',
};

export default function PokedexPage() {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Pokédex</h1>
      <p className="text-text-muted mt-1 text-sm">1025 Pokémon, une seule meilleure carte par entrée.</p>

      <div className="bg-surface border-border mt-6 rounded-lg border p-6">
        <p className="text-text-faint font-mono text-xs">Grille à venir en Phase 1.9.</p>
      </div>
    </section>
  );
}
