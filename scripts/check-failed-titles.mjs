import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/home/fhuang5/Developer/I.R.I.S/.env.local', 'utf8');
const SUPABASE_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const SUPABASE_KEY = (env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/) || env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/))[1].trim();
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Show count + breakdown of imported cards
const { count: forSale } = await supabase.from('cards').select('*', { count: 'exact', head: true }).eq('status', 'for_sale');
const { count: listings } = await supabase.from('card_listings').select('*', { count: 'exact', head: true });
console.log(`for_sale: ${forSale}, card_listings: ${listings}`);
const { data: top } = await supabase.from('cards').select('card_id_tcg, set_code, set_number, language, condition, pokemon_name').eq('status', 'for_sale').order('date_added', { ascending: false }).limit(8);
console.log('Most recent imported (8):');
for (const c of top ?? []) {
  console.log(`  tcg=${c.card_id_tcg} ${c.set_code}-${c.set_number}/${c.language} ${c.pokemon_name?.slice(0,40)}`);
}
