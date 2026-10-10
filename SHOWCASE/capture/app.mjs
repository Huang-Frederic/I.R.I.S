/**
 * Serves the app for the capture: `next dev` from the repository root, on its
 * own port, wired to the local stack instead of the production project.
 *
 * Next.js reads process.env before .env.local, so the variables set here win
 * over the developer's real ones. Every key that could reach a paid API or a
 * production service is blanked: the capture runs on fixtures only. Next 16
 * keeps dev output in .next/dev, so a production build in .next is untouched.
 */
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_PORT } from './stack.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const NEXT = join(ROOT, 'node_modules/next/dist/bin/next');
export const APP_URL = `http://127.0.0.1:${APP_PORT}`;

// Keys the app reads that point outside the local stack: blank, so nothing
// leaves the machine except public catalog images (Cardmarket, TCGdex, PokeAPI).
const BLANKED = [
  'GEMINI_API_KEY', 'GOOGLE_VISION_API_KEY', 'ANTHROPIC_API_KEY', 'POKEMON_TCG_API_KEY',
  'BRIGHTDATA_TOKEN', 'BRIGHTDATA_ZONE', 'PROJECT_REF',
  'MKM_APP_TOKEN', 'MKM_APP_SECRET', 'MKM_ACCESS_TOKEN', 'MKM_ACCESS_SECRET', 'MKM_API_URL',
];

/** Starts the app and resolves once it answers; returns a function that stops it. */
export async function startApp(stack, { vintedUserIds }) {
  const env = {
    ...process.env,
    ...Object.fromEntries(BLANKED.map((key) => [key, ''])),
    NEXT_PUBLIC_SUPABASE_URL: stack.apiUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: stack.anonKey,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: stack.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: stack.serviceKey,
    NEXT_PUBLIC_APP_URL: APP_URL,
    CRON_SECRET: 'showcase-capture',
    VINTED_USER_IDS: vintedUserIds.join(','),
    NEXT_TELEMETRY_DISABLED: '1',
  };
  const child = spawn(process.execPath, [NEXT, 'dev', '--port', String(APP_PORT), '--hostname', '127.0.0.1'], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const stop = () => new Promise((done) => {
    if (child.exitCode !== null) return done();
    child.once('exit', done);
    child.kill();
  });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next dev exited:\n${output.slice(-2000)}`);
    try {
      const res = await fetch(`${APP_URL}/login`);
      if (res.ok) return stop;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  await stop();
  throw new Error(`next dev did not answer on ${APP_URL}:\n${output.slice(0, 1500)}\n…\n${output.slice(-1500)}`);
}
