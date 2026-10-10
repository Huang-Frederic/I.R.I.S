/**
 * Loads the fixtures into the local stack (see stack.mjs).
 *
 * fixtures/ is a sanitized snapshot of the production data taken on
 * 2026-10-10 (meta.json): two test accounts with generated passwords, the
 * collection without notes or personal photos (lists fall back to the
 * Cardmarket catalog image, as the app does for a card without a photo), fake
 * Vinted listing ids, generated handles for the PTCG Live opponents, a dozen
 * lots and four items with their photos, and the recent logs only. The catalog
 * itself comes from the snapshots the project already keeps in backups/.
 *
 * Dates are shifted by the time elapsed since the export, so the data looks as
 * fresh on the day of the capture as it was that day ("posted today" stays
 * today). Triggers are off while loading: rows land exactly as exported.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import pg from 'pg';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const FIXTURES = join(HERE, 'fixtures');
const DAY = 86_400_000;

/** A fixture file, plain or gzipped JSON. */
export function fixture(name) {
  const plain = join(FIXTURES, `${name}.json`);
  try {
    return JSON.parse(readFileSync(plain, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return JSON.parse(gunzipSync(readFileSync(`${plain}.gz`)).toString('utf8'));
  }
}

/** Rows of a gzipped JSON-lines snapshot from backups/. */
function backup(name) {
  return gunzipSync(readFileSync(join(ROOT, 'backups', name)))
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/** Moves every timestamp and date of a row forward by `shift` ms. */
function shifted(row, shift) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
      out[key] = new Date(Date.parse(value) + shift).toISOString();
    } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      out[key] = new Date(Date.parse(`${value}T12:00:00Z`) + shift).toISOString().slice(0, 10);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Event titles carry their own date ("… - 24/10/2026 - 14H00"): keep them in step. */
function shiftTitleDates(title, shift) {
  return title.replace(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g, (match, d, m, y) => {
    const date = new Date(Date.parse(`${y}-${m}-${d}T12:00:00Z`) + shift);
    if (Number.isNaN(date.getTime())) return match;
    return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
  });
}

async function insert(db, table, rows, batch = 2000) {
  for (let i = 0; i < rows.length; i += batch) {
    await db.query(
      `insert into public.${table} select * from json_populate_recordset(null::public.${table}, $1::json)`,
      [JSON.stringify(rows.slice(i, i + batch))],
    );
  }
}

async function upload(stack, bucket, path, file) {
  const res = await fetch(`${stack.apiUrl}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${stack.serviceKey}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
    body: readFileSync(file),
  });
  if (!res.ok) throw new Error(`upload ${bucket}/${path}: ${res.status} ${await res.text()}`);
}

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

/** The parser output for every game, from the project's own lib/ptcg (via tsx). */
function rebuildGames(games) {
  const dir = mkdtempSync(join(tmpdir(), 'showcase-ptcg-'));
  try {
    const input = join(dir, 'games.json');
    const output = join(dir, 'state.json');
    writeFileSync(input, JSON.stringify(games.map(({ id, raw_log }) => ({ id, raw_log }))));
    execFileSync(process.execPath, [join(ROOT, 'node_modules/tsx/dist/cli.mjs'), join(HERE, 'ptcg-state.ts'), input, output], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    return new Map(JSON.parse(readFileSync(output, 'utf8')).map((g) => [g.id, g]));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function seed(stack) {
  const meta = fixture('meta');
  const shift = Date.now() - Date.parse(meta.exported_at);
  const users = fixture('users');
  const storage = `${stack.apiUrl}/storage/v1/object/public`;
  const db = new pg.Client({ connectionString: stack.dbUrl });
  await db.connect();
  try {
    await db.query('set session_replication_role = replica');

    // Accounts, as GoTrue stores them (the token columns must be '' rather than null).
    for (const user of users) {
      await db.query(
        `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
           raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
           confirmation_token, email_change, email_change_token_new, recovery_token)
         values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
           extensions.crypt($3, extensions.gen_salt('bf')), now(),
           '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')`,
        [user.id, user.email, user.password],
      );
      await db.query(
        `insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
         values (gen_random_uuid(), $1::uuid, $1::text, jsonb_build_object('sub', $1::text, 'email', $2::text, 'email_verified', true),
           'email', now(), now(), now())`,
        [user.id, user.email],
      );
    }

    // The catalog, from the project's committed snapshots.
    await insert(db, 'cardmarket_expansions', backup('cardmarket_expansions.jsonl.gz'));
    await insert(db, 'cardmarket_card_index', backup('cardmarket_card_index.jsonl.gz'), 5000);
    await insert(db, 'tcg_catalog', backup('tcg_catalog.jsonl.gz'), 5000);
    await insert(db, 'cardmarket_products', fixture('cardmarket_products'));
    await insert(db, 'cardmarket_pricing', fixture('cardmarket_pricing').map((r) => shifted(r, shift)));

    // The collection and everything around it.
    const load = (name) => fixture(name).map((r) => shifted(r, shift));
    await db.query('delete from public.config'); // the migrations seed default values
    for (const table of ['user_profiles', 'config', 'lots']) await insert(db, table, load(table));
    await insert(db, 'cards', load('cards').map((c) => ({ ...c, image_url: c.image_url?.replace('{storage}', storage) ?? null })));
    for (const table of ['card_listings', 'lot_listings', 'other_items', 'other_item_listings', 'stock_value_snapshots', 'ocr_usage_log', 'audit_logs']) {
      await insert(db, table, load(table));
    }
    const history = fixture('price_history');
    await insert(db, 'price_history', history.rows.map(([card, bucket_date, granularity, low, trend, avg, freshness]) =>
      shifted({ card_id: history.card_ids[card], bucket_date, granularity, cm_price_low: low, cm_price_trend: trend, cm_price_avg: avg, source_freshness_days: freshness, created_at: meta.exported_at }, shift),
    ), 5000);
    await insert(db, 'store_events', load('store_events').map((e) => ({ ...e, title: shiftTitleDates(e.title, shift) })));
    for (const table of ['vinted_bot_config', 'vinted_bot_schedule', 'vinted_queue', 'vinted_post_jobs', 'vinted_agent_logs', 'vinted_catalog_attributes']) {
      await insert(db, table, load(table));
    }

    // PTCG Live: the board states are rebuilt from the logs by the app's own parser.
    for (const table of ['ptcg_cards', 'ptcg_tournaments', 'ptcg_tournament_rounds', 'ptcg_drill_profiles']) {
      await insert(db, table, load(table));
    }
    const games = load('ptcg_games');
    const parsed = rebuildGames(games);
    await insert(db, 'ptcg_games', games.map((g) => ({ ...g, ...parsed.get(g.id) })), 10);

    // The bot is "online": the capture refreshes this right before the bot page too.
    await heartbeat(db, users.map((u) => u.id));
    await db.query('set session_replication_role = origin');
  } finally {
    await db.end();
  }

  // Photos: hero cards, lots and items, at the paths the fixtures point to.
  const photos = join(FIXTURES, 'photos');
  const buckets = { cards: 'card-photos', lots: 'lot-photos', items: 'other-item-photos' };
  for (const [folder, bucket] of Object.entries(buckets)) {
    for (const file of files(join(photos, folder))) {
      await upload(stack, bucket, relative(join(photos, folder), file).replaceAll('\\', '/'), file);
    }
  }
  return { users, shiftDays: shift / DAY };
}

export async function heartbeat(db, userIds) {
  for (const id of userIds) {
    await db.query(
      `insert into public.agent_heartbeats (user_id, last_seen_at) values ($1, now())
       on conflict (user_id) do update set last_seen_at = now()`,
      [id],
    );
  }
}
