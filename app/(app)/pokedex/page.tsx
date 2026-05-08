import { createClient } from '@/lib/supabase/server';
import PokedexGrid from '@/components/pokedex/PokedexGrid';
import PageTitle from '@/components/layout/PageTitle';
import type { Card } from '@/lib/types';

export const metadata = {
  title: 'Pokédex — I.R.I.S',
};

export default async function PokedexPage() {
  const supabase = await createClient();
  // Pull every card the user owns that could appear on this page — the grid needs
  // 'pokedex' to know which slots are filled, plus 'for_sale' / 'collection' to feed
  // the drawer's "Replace by..." picker.
  const { data, error } = await supabase
    .from('cards')
    .select('*')
    .in('status', ['pokedex', 'for_sale', 'collection']);

  if (error) {
    return (
      <section>
        <PageTitle title="Pokédex" />
        <p className="text-red mt-4 text-sm">Erreur de chargement : {error.message}</p>
      </section>
    );
  }

  const cards = (data ?? []) as Card[];
  const completed = cards.filter((c) => c.status === 'pokedex').length;

  return (
    <section>
      <PageTitle
        title="Pokédex"
        subtitle={`${completed} / 1025 enregistrés (${Math.round((completed / 1025) * 100)}%)`}
      />
      <div className="mt-6">
        <PokedexGrid cards={cards} />
      </div>
    </section>
  );
}
