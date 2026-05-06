import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('/home/fhuang5/Developer/I.R.I.S/.env.local', 'utf8');
const SUPABASE_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const SUPABASE_KEY = (env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/) || env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/))[1].trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const { count: totalForSale } = await supabase.from('cards').select('*', { count: 'exact', head: true }).eq('status', 'for_sale');
const { count: nullCardId } = await supabase.from('cards').select('*', { count: 'exact', head: true }).eq('status', 'for_sale').is('card_id_tcg', null);
const { data: sample } = await supabase.from('cards').select('id, card_id_tcg, set_code, set_number, language, condition, pokemon_name, status, date_added').eq('status', 'for_sale').order('date_added', { ascending: false }).limit(5);
const { count: listingsCount } = await supabase.from('card_listings').select('*', { count: 'exact', head: true });

console.log(`for_sale cards in DB: ${totalForSale}`);
console.log(`  with card_id_tcg=NULL: ${nullCardId}`);
console.log(`card_listings rows: ${listingsCount}`);
console.log('5 most recent for_sale cards:');
for (const c of sample ?? []) {
  console.log(`  ${c.date_added.slice(0,16)} | id=${c.id.slice(0,8)} | tcg=${c.card_id_tcg ?? 'NULL'} | ${c.set_code}-${c.set_number}/${c.language}/${c.condition} | ${c.pokemon_name?.slice(0,40)}`);
}
