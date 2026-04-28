// scripts/cardmarket-ping.ts
/**
 * Validates Cardmarket OAuth setup. Run AFTER adding MKM_* tokens to
 * .env.local. A successful response means the wrapper signs correctly
 * and the credentials are accepted.
 *
 * Usage: npx tsx scripts/cardmarket-ping.ts
 */
import fs from 'node:fs';
import path from 'node:path';

// Load .env.local (no dotenv dependency — same pattern as test-bench.ts)
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
  }
}

async function main() {
  const required = ['MKM_APP_TOKEN', 'MKM_APP_SECRET', 'MKM_ACCESS_TOKEN', 'MKM_ACCESS_SECRET'];
  for (const key of required) {
    if (!process.env[key]) {
      console.error(`Missing ${key} in .env.local`);
      process.exit(1);
    }
  }

  const { getAccount } = await import('../lib/api/cardmarket');
  console.log('Calling Cardmarket /account ...');
  const account = await getAccount();
  console.log(`OK — authenticated as "${account.username}" (idUser=${account.idUser})`);
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  console.error('\nIf 401: signature wrong OR tokens invalid OR account suspended');
  console.error('If 403: app type does not have access to this endpoint');
  process.exit(1);
});
