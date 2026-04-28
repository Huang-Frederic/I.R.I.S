// lib/api/cardmarket.ts
import 'server-only';
import { createHmac, randomBytes } from 'node:crypto';

/**
 * Cardmarket API wrapper — OAuth 1.0a (HMAC-SHA1) per
 * https://api.cardmarket.com/ws/documentation/API_2.0:Auth_Signature
 *
 * Used by:
 *   - scripts/scrape-cardmarket.ts (bootstrap of tcg_catalog)
 *   - scripts/cardmarket-ping.ts   (validates OAuth setup)
 *   - Phase 3: app/api/prices/update/route.ts (live pricing cron)
 *
 * Rate limiting is the caller's responsibility — Cardmarket's Personal
 * App tier is roughly 5000 requests/day. The scrape script uses a
 * 500ms delay between requests as a polite default.
 */

const BASE_URL = process.env.MKM_API_URL ?? 'https://api.cardmarket.com/ws/v2.0';

const REQUIRED_ENV = ['MKM_APP_TOKEN', 'MKM_APP_SECRET', 'MKM_ACCESS_TOKEN', 'MKM_ACCESS_SECRET'] as const;

/** RFC 3986 strict percent-encoding. OAuth 1.0a requires this exact form. */
export function percentEncode(s: string): string {
  return encodeURIComponent(s).replace(
    /[!*'()]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

export function buildSigningKey(appSecret: string, accessSecret: string): string {
  return `${percentEncode(appSecret)}&${percentEncode(accessSecret)}`;
}

export function buildSignatureBaseString(
  method: string,
  url: string,
  params: Record<string, string>,
): string {
  const sortedKeys = Object.keys(params).sort();
  const paramsString = sortedKeys
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join('&');
  return `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramsString)}`;
}

interface SignRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  appToken: string;
  appSecret: string;
  accessToken: string;
  accessSecret: string;
  /** Test-only override for deterministic signatures. */
  _testTimestamp?: string;
  _testNonce?: string;
}

/**
 * Builds the full `Authorization: OAuth ...` header for a Cardmarket request.
 * The realm is the URL itself — Cardmarket's quirk, documented in their guide.
 */
export function signRequest(opts: SignRequestOptions): string {
  const timestamp =
    opts._testTimestamp ?? Math.floor(Date.now() / 1000).toString();
  const nonce = opts._testNonce ?? randomBytes(16).toString('hex');

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: opts.appToken,
    oauth_token: opts.accessToken,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_nonce: nonce,
    oauth_version: '1.0',
  };

  const baseString = buildSignatureBaseString(opts.method, opts.url, oauthParams);
  const signingKey = buildSigningKey(opts.appSecret, opts.accessSecret);
  const signature = createHmac('sha1', signingKey).update(baseString).digest('base64');

  const headerParams: Record<string, string> = { ...oauthParams, oauth_signature: signature };
  const headerString = Object.keys(headerParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(headerParams[k])}"`)
    .join(', ');

  return `OAuth realm="${opts.url}", ${headerString}`;
}

/** Internal helper: signs + sends a request, throws on non-2xx. */
async function mkmFetch(path: string, method: 'GET' = 'GET'): Promise<unknown> {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Cardmarket: missing env vars: ${missing.join(', ')}. See .env.example.`);
  }

  const url = `${BASE_URL}${path}`;
  const auth = signRequest({
    method,
    url,
    appToken: process.env.MKM_APP_TOKEN!,
    appSecret: process.env.MKM_APP_SECRET!,
    accessToken: process.env.MKM_ACCESS_TOKEN!,
    accessSecret: process.env.MKM_ACCESS_SECRET!,
  });

  const response = await fetch(url, {
    method,
    headers: { Authorization: auth },
    signal: AbortSignal.timeout(15_000),
  });

  if (response.status === 204) return null; // No content (rate limit reset etc.)
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cardmarket ${response.status} ${path}: ${body.slice(0, 200)}`);
  }
  return response.json();
}

// ---------------------------------------------------------------------------
// Endpoint wrappers
// ---------------------------------------------------------------------------

/** Pokémon's game ID on Cardmarket. */
export const POKEMON_GAME_ID = 6;

export interface MKMExpansion {
  idExpansion: number;
  abbreviation: string;
  enName: string;
  releaseDate?: string;
  isReleased?: boolean;
}

export async function getPokemonExpansions(): Promise<MKMExpansion[]> {
  const data = (await mkmFetch(`/games/${POKEMON_GAME_ID}/expansions`)) as {
    expansion: MKMExpansion[];
  };
  return data.expansion ?? [];
}

export interface MKMSingle {
  idProduct: number;
  enName: string;
  localization?: { name: string; idLanguage: number }[];
  number?: string;
  rarity?: string;
  expansion?: { idExpansion: number; enName: string; abbreviation: string };
  image?: string;
}

/**
 * Returns all single products in an expansion. The endpoint groups by
 * "metaProduct" (one per card design); language variants are exposed via
 * the `localization` array on each product.
 */
export async function getExpansionSingles(idExpansion: number): Promise<MKMSingle[]> {
  const data = (await mkmFetch(`/expansions/${idExpansion}/singles`)) as {
    single: MKMSingle[];
  };
  return data.single ?? [];
}

/** Used by cardmarket-ping to validate OAuth credentials. */
export async function getAccount(): Promise<{ idUser: number; username: string }> {
  const data = (await mkmFetch('/account')) as {
    account: { idUser: number; username: string };
  };
  return data.account;
}
