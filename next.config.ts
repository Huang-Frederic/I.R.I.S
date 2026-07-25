import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

const nextConfig: NextConfig = {
  // Bumped to 25MB to allow lot photo multipart uploads (default is 1MB).
  // Lots can have up to ~10 photos at ~2-3MB each from a phone camera.
  experimental: {
    proxyClientMaxBodySize: '25mb',
    // Router Cache freshness. dynamic:0 → a revisited dynamic page is refetched
    // once on navigation (fresh data), which replaces the old
    // RouteChangeRefresher's manual router.refresh() — that one fired AFTER
    // every navigation, causing a double server round-trip per page change.
    staleTimes: {
      dynamic: 0,
      static: 180,
    },
  },
  images: {
    remotePatterns: [
      // Pokémon TCG official card images
      { protocol: 'https', hostname: 'images.pokemontcg.io' },
      // TCGdex card art, used by the game replay (lib/ptcg/). The stored
      // image_url has no extension: the size and format are appended at render.
      { protocol: 'https', hostname: 'assets.tcgdex.net' },
      // PokeAPI sprites (used for Pokédex grid)
      { protocol: 'https', hostname: 'raw.githubusercontent.com', pathname: '/PokeAPI/**' },
      // Cardmarket product images (Strategy 0 + cross-validate cardmarket fallback)
      { protocol: 'https', hostname: 'product-images.s3.cardmarket.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
