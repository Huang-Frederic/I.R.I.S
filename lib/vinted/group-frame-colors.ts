// lib/vinted/group-frame-colors.ts
// Full literal Tailwind class names — Tailwind's static scanner can't see
// classes built with template-string interpolation, so the hash below picks
// a key into these maps rather than constructing class names at runtime.
// Shared by GroupedQueueGrid.tsx and GroupedRepostGrid.tsx.
export const GROUP_FRAME_CLASSES = {
  sar: 'border-rarity-sar bg-rarity-sar/10',
  ar: 'border-rarity-ar bg-rarity-ar/10',
  sr: 'border-rarity-sr bg-rarity-sr/10',
  chr: 'border-rarity-chr bg-rarity-chr/10',
  rr: 'border-rarity-rr bg-rarity-rr/10',
  rHolo: 'border-rarity-r-holo bg-rarity-r-holo/10',
  r: 'border-rarity-r bg-rarity-r/10',
  uc: 'border-rarity-uc bg-rarity-uc/10',
  c: 'border-rarity-c bg-rarity-c/10',
} as const;

export const GROUP_LABEL_CLASSES = {
  sar: 'bg-rarity-sar',
  ar: 'bg-rarity-ar',
  sr: 'bg-rarity-sr',
  chr: 'bg-rarity-chr',
  rr: 'bg-rarity-rr',
  rHolo: 'bg-rarity-r-holo',
  r: 'bg-rarity-r',
  uc: 'bg-rarity-uc',
  c: 'bg-rarity-c',
} as const;

const GROUP_COLOR_KEYS = Object.keys(GROUP_FRAME_CLASSES) as (keyof typeof GROUP_FRAME_CLASSES)[];

export function colorKeyForGroup(key: string): keyof typeof GROUP_FRAME_CLASSES {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return GROUP_COLOR_KEYS[Math.abs(hash) % GROUP_COLOR_KEYS.length];
}
