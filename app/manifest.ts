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
    // Manifest is single-theme. Match the dark bg so the install splash and
    // any fallback tinting blend with --color-bg. The runtime theme color
    // (which actually drives Android's status bar) is theme-aware via
    // viewport.themeColor in app/layout.tsx.
    theme_color: '#111110',
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
