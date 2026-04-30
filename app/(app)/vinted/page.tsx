// app/(app)/vinted/page.tsx
import { createClient } from '@/lib/supabase/server';
import VintedList from '@/components/vinted/VintedList';
import type { Card } from '@/lib/types';

export const metadata = {
  title: 'Vinted — I.R.I.S',
};

export default async function VintedPage() {
  const supabase = await createClient();

  const [{ data: forSale, error }, { data: pokedex }, { data: configRows }] = await Promise.all([
    supabase
      .from('cards')
      .select('*')
      .eq('status', 'for_sale')
      .order('date_added', { ascending: true }),
    supabase
      .from('cards')
      .select('pokemon_number')
      .eq('status', 'pokedex'),
    supabase.from('config').select('*'),
  ]);

  if (error) {
    return (
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Vinted</h1>
        <p className="text-red mt-4 text-sm">Erreur de chargement : {error.message}</p>
      </section>
    );
  }

  const cards = (forSale ?? []) as Card[];
  const registered = new Set<number>((pokedex ?? []).map((r: { pokemon_number: number }) => r.pokemon_number));
  const config = Object.fromEntries(
    (configRows ?? []).map((r: { key: string; value: string }) => [r.key, r.value]),
  ) as Record<string, string>;

  return (
    <section>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Vinted</h1>
        <p className="text-text-muted mt-1 text-sm">
          {cards.length} carte{cards.length > 1 ? 's' : ''} en stock — tri FIFO
        </p>
      </div>
      <div className="mt-6">
        <VintedList cards={cards} registered={registered} config={config} />
      </div>
    </section>
  );
}
