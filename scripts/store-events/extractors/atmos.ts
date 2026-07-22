import type { Extractor, StoreEvent } from '../types';
import { fetchText } from '../lib/http';
import { classifyEventType } from '../lib/classify';

/**
 * Atmos Arena (Paris) — pretix-powered event list at event.atmos-arena.com.
 * `meta.url` points at the Pokémon-filtered list (?filtered=1&attr[tcg_name]=POKEMON),
 * which is server-rendered STATIC HTML (no browser needed). Each event is an
 * `<article class="row">` carrying:
 *   - a title link  <h3><a href="/atmosarena/<slug>/">Ligue Pokemon 23/07</a></h3>
 *   - a clean date  <time datetime="2026-07-23">
 *   - a precise UTC start  data-time="2026-07-23T17:00:00+00:00"
 * so no French-date parsing is needed — the ISO timestamps are right there.
 */
const ARTICLE = /<article class="row"[\s\S]*?<\/article>/gi;
const TITLE_LINK = /<h3[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;

export const atmos: Extractor = async (meta) => {
  const html = await fetchText(meta.url);
  const base = new URL(meta.url);
  const events: StoreEvent[] = [];

  for (const block of html.match(ARTICLE) ?? []) {
    const link = block.match(TITLE_LINK);
    if (!link) continue;
    const url = new URL(link[1], base).toString();
    const title = link[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!title) continue;

    // Prefer the precise UTC start (`data-time`), fall back to the date-only <time>.
    const raw = block.match(/data-time="([^"]+)"/i)?.[1] ?? block.match(/<time[^>]+datetime="([^"]+)"/i)?.[1] ?? null;
    let startsAt: string | null = null;
    if (raw) {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) startsAt = d.toISOString();
    }

    // Stable id: pretix's numeric event id, else the URL slug, else the title.
    const nativeId = block.match(/event-(\d+)-label/i)?.[1] ?? link[1].split('/').filter(Boolean).pop() ?? title;

    events.push({
      source: meta.id,
      shopName: meta.name,
      city: meta.city,
      title,
      eventType: classifyEventType(title),
      startsAt,
      url,
      price: null,
      externalId: `${meta.id}:${nativeId}`,
    });
  }

  return events;
};
