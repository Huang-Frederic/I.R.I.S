import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('/home/fhuang5/Developer/I.R.I.S/.env.local', 'utf8');
const SUPABASE_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const SUPABASE_KEY = (env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/) || env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/))[1].trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// pokemon_number coverage by set_code (JP)
const { data } = await supabase
  .from('tcg_catalog')
  .select('set_code, pokemon_number')
  .eq('language', 'JP')
  .limit(20000);

const byCode = new Map();
for (const r of data ?? []) {
  if (!byCode.has(r.set_code)) byCode.set(r.set_code, { total: 0, withDex: 0 });
  const e = byCode.get(r.set_code);
  e.total++;
  if (r.pokemon_number != null) e.withDex++;
}
console.log('JP pokemon_number coverage by set_code:');
for (const [code, { total, withDex }] of [...byCode].sort()) {
  const pct = ((withDex / total) * 100).toFixed(0);
  console.log(`  ${code.padEnd(8)} ${withDex}/${total} (${pct}%)`);
}
