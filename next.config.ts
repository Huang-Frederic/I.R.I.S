import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Pokémon TCG official card images
      { protocol: 'https', hostname: 'images.pokemontcg.io' },
      // PokeAPI sprites (used for Pokédex grid)
      { protocol: 'https', hostname: 'raw.githubusercontent.com', pathname: '/PokeAPI/**' },
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

export default nextConfig;
