import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('/home/fhuang5/Developer/I.R.I.S/.env.local', 'utf8');
const SUPABASE_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const SUPABASE_KEY = (env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/) || env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/))[1].trim();
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Cards inserted today by the broken import path: status=for_sale + card_id_tcg=NULL
const { data: broken, error: selErr } = await supabase
  .from('cards')
  .select('id, set_code, set_number, language, condition, pokemon_name, date_added')
  .eq('status', 'for_sale')
  .is('card_id_tcg', null);

if (selErr) { console.error(selErr); process.exit(1); }
console.log(`Found ${broken?.length ?? 0} for_sale cards with card_id_tcg=NULL:`);
for (const c of broken ?? []) {
  console.log(`  ${c.id} | ${c.set_code}-${c.set_number}/${c.language} | ${c.pokemon_name?.slice(0,50)}`);
}
if (!broken?.length) process.exit(0);

const ids = broken.map(c => c.id);
// card_listings has ON DELETE CASCADE on card_id, so listings get cleaned automatically
const { error: delErr } = await supabase.from('cards').delete().in('id', ids);
if (delErr) { console.error('delete failed:', delErr); process.exit(1); }
console.log(`Deleted ${ids.length} broken card(s).`);
