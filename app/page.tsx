export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="bg-surface border-border max-w-md rounded-lg border p-8 text-center">
        <h1 className="text-red text-3xl font-bold tracking-tight">I.R.I.S</h1>
        <p className="text-text-muted mt-2 text-sm">Gestion de collection Pokémon TCG</p>
        <p className="text-text-faint mt-6 font-mono text-xs">
          Phase 1 — scaffold OK. Auth, scan et Pokédex à venir.
        </p>
      </div>
    </main>
  );
}
