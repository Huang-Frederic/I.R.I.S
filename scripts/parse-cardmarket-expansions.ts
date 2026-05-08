// Parses the <select> dropdown HTML from Cardmarket's Expansion filter page
// into a clean JSON mapping { idExpansion: setName }. The dropdown is the
// authoritative source — covers 100% of idExpansion values, including JP
// sets like Cyber Judge / Snow Hazard, CN sets, and FR-localised names.
//
// Usage: tsx scripts/parse-cardmarket-expansions.ts <input.html> <output.json>

import { readFileSync, writeFileSync } from 'node:fs';

const inFile = process.argv[2];
const outFile = process.argv[3];
if (!inFile || !outFile) {
  console.error('Usage: tsx scripts/parse-cardmarket-expansions.ts <input.html> <output.json>');
  process.exit(1);
}

const html = readFileSync(inFile, 'utf-8');

// Match <option value="ID">NAME</option> pairs.
// HTML entities common: &amp; → &, &quot; → ", &eacute; → é, etc.
const optionRe = /<option\s+value="(\d+)"[^>]*>([^<]+)<\/option>/g;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&eacute;/g, 'é')
    .replace(/&egrave;/g, 'è')
    .replace(/&ecirc;/g, 'ê')
    .replace(/&agrave;/g, 'à')
    .replace(/&acirc;/g, 'â')
    .replace(/&iuml;/g, 'ï')
    .replace(/&icirc;/g, 'î')
    .replace(/&ucirc;/g, 'û')
    .replace(/&ouml;/g, 'ö')
    .replace(/&ccedil;/g, 'ç')
    .replace(/&nbsp;/g, ' ');
}

const map: Record<string, string> = {};
let match: RegExpExecArray | null;
while ((match = optionRe.exec(html)) !== null) {
  const id = match[1];
  const name = decodeEntities(match[2]).trim();
  if (id === '0' || !name) continue; // skip the "Tout" / "All" option
  map[id] = name;
}

writeFileSync(outFile, JSON.stringify(map, null, 2));
console.log(`Parsed ${Object.keys(map).length} expansions → ${outFile}`);
