/**
 * The backend the showcase is recorded against: a throwaway Supabase stack
 * (Docker) built from the project's own migrations, then seeded with the
 * fixtures in ./fixtures (see seed.mjs). Nothing here talks to the production
 * project.
 *
 * The stack's working folder lives in the system's temporary folder, so the
 * repository stays untouched: config.toml is copied with its own project id
 * and ports (+1000, so it never collides with a `supabase start` of the real
 * project), the migrations are copied as they are, and one extra migration
 * runs first to enable pg_cron, which the hosted project switched on from the
 * dashboard (20260513000000_price_history.sql schedules a job with it).
 *
 *   node stack.mjs start     start (or reuse) the stack, print its URLs
 *   node stack.mjs stop      stop it and drop its data
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const CLI = join(HERE, 'node_modules/supabase/dist/supabase.js');
export const WORKDIR = join(tmpdir(), 'iris-showcase-stack');
const PORT_SHIFT = 1000;
// The app is served on its own port too, next to a `npm run dev` on 3000.
export const APP_PORT = 3100;
// Only what the app talks to: auth, REST, realtime, storage, and the gateway.
const EXCLUDED = 'studio,imgproxy,edge-runtime,logflare,vector,mailpit,postgres-meta,supavisor';

function supabase(args, options = {}) {
  return execFileSync(process.execPath, [CLI, ...args, '--workdir', WORKDIR], {
    encoding: 'utf8',
    stdio: options.quiet ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'pipe', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Rebuilds the temporary workdir from the repository's supabase/ folder. */
function prepare() {
  const dir = join(WORKDIR, 'supabase');
  rmSync(join(dir, 'migrations'), { recursive: true, force: true });
  mkdirSync(join(dir, 'migrations'), { recursive: true });
  const config = readFileSync(join(ROOT, 'supabase/config.toml'), 'utf8')
    .replace(/^project_id = .*$/m, 'project_id = "iris-showcase"')
    .replace(/^(\s*(?:port|shadow_port|inspector_port)\s*=\s*)(\d+)/gm, (_, key, port) => key + (Number(port) + PORT_SHIFT))
    .replace(/^(site_url = ").*(")$/m, `$1http://127.0.0.1:${APP_PORT}$2`);
  writeFileSync(join(dir, 'config.toml'), config);
  writeFileSync(
    join(dir, 'migrations', '00000000000000_showcase_extensions.sql'),
    '-- Added by SHOWCASE/capture/stack.mjs: the hosted project enables pg_cron from the dashboard.\n' +
      'create extension if not exists pg_cron with schema pg_catalog;\n',
  );
  for (const file of readdirSync(join(ROOT, 'supabase/migrations'))) {
    if (file.endsWith('.sql')) cpSync(join(ROOT, 'supabase/migrations', file), join(dir, 'migrations', file));
  }
}

/** The running stack's URLs and keys. */
export function status() {
  const json = JSON.parse(supabase(['status', '-o', 'json'], { quiet: true }));
  return {
    apiUrl: json.API_URL,
    dbUrl: json.DB_URL,
    anonKey: json.ANON_KEY ?? json.PUBLISHABLE_KEY,
    serviceKey: json.SERVICE_ROLE_KEY ?? json.SECRET_KEY,
  };
}

/** Starts the stack (or reuses a running one) and resets its database to the bare migrations. */
export function start({ reset = true } = {}) {
  prepare();
  let running = false;
  try {
    status();
    running = true;
  } catch {
    // not running yet
  }
  if (!running) supabase(['start', '-x', EXCLUDED]);
  else if (reset) supabase(['db', 'reset', '--no-seed']);
  return status();
}

export function stop() {
  supabase(['stop', '--no-backup']);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  if (command === 'start') console.log(start({ reset: false }));
  else if (command === 'stop') stop();
  else console.log('usage: node stack.mjs start|stop');
}
