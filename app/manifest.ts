import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'I.R.I.S — Intelligent Recognition Inventory System',
    short_name: 'I.R.I.S',
    description: 'Gestion de collection Pokémon TCG (Pokédex + stock Vinted)',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#111110',
    theme_color: '#e05252',
    categories: ['utilities', 'productivity', 'lifestyle'],
    lang: 'fr-FR',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
