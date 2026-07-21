import type { Extractor, StoreEvent, EventType } from '../types';

/**
 * Le Coin des Barons — MANUAL source. Their planning is a monthly Instagram
 * poster (no scrapable site), so the Pokémon events are transcribed by hand
 * from the image. The link is their Instagram (per Fred's request).
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ TO UPDATE: when Fred sends the next monthly poster, replace EVENTS    │
 * │ below with the new month's Pokémon-only events. Everything else       │
 * │ (dates → ISO, links) is handled automatically.                        │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Current poster: Juillet 2026.
 */

interface ManualEvent {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM (24h)
  name: string;
  type: EventType | null;
  price: number | null; // 0 = gratuit
}

const EVENTS: ManualEvent[] = [
  { date: '2026-07-06', time: '19:00', name: 'Avant-première Pokémon (20 places)', type: 'prerelease', price: 35 },
  { date: '2026-07-08', time: '15:00', name: 'Avant-première Pokémon Parent/Enfant (10 places)', type: 'prerelease', price: 35 },
  { date: '2026-07-08', time: '19:00', name: 'Avant-première Pokémon (20 places)', type: 'prerelease', price: 35 },
  { date: '2026-07-18', time: '19:00', name: "Bourse d'échanges Pokémon", type: null, price: 0 },
  { date: '2026-07-19', time: '19:00', name: 'Celebration Day 2nd Edition', type: null, price: 15 },
  { date: '2026-07-26', time: '19:00', name: 'Session de Ligue', type: 'league', price: 0 },
  { date: '2026-08-02', time: '19:00', name: 'Session de Ligue', type: 'league', price: 0 },
];

export const coinDesBarons: Extractor = async (meta) => {
  return EVENTS.map((e): StoreEvent => {
    const slug = e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return {
      source: meta.id,
      shopName: meta.name,
      city: meta.city,
      title: e.name,
      eventType: e.type,
      startsAt: `${e.date}T${e.time}:00.000Z`,
      url: meta.url, // their Instagram
      price: e.price,
      externalId: `${meta.id}:${e.date}-${e.time.replace(':', '')}-${slug}`,
    };
  });
};
