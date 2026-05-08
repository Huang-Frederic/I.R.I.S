/**
 * Regenerate PWA icons from /logo.png.
 * Usage: npx tsx scripts/generate-icons.ts
 */

import sharp from 'sharp';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'logo.png');
const OUT_DIR = path.join(ROOT, 'public', 'icons');

const DARK_BG = { r: 0x11, g: 0x11, b: 0x10, alpha: 1 };

async function generate() {
  const meta = await sharp(SOURCE).metadata();
  console.log(`Source: ${meta.width}x${meta.height} ${meta.format}`);

  // icon-192.png — standard PWA icon, transparent background.
  await sharp(SOURCE)
    .resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(OUT_DIR, 'icon-192.png'));
  console.log('Wrote icon-192.png');

  // icon-512.png — standard PWA icon, transparent background.
  await sharp(SOURCE)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(OUT_DIR, 'icon-512.png'));
  console.log('Wrote icon-512.png');

  // icon-512-maskable.png — Android adaptive icon. Safe zone is the central 80%.
  // We fit the logo inside a 410x410 canvas (80% of 512), centered on a solid
  // dark background (#111110, matching the app's --color-bg).
  const SAFE_ZONE = Math.round(512 * 0.8);
  const innerLogo = await sharp(SOURCE)
    .resize(SAFE_ZONE, SAFE_ZONE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: DARK_BG,
    },
  })
    .composite([{ input: innerLogo, gravity: 'center' }])
    .png()
    .toFile(path.join(OUT_DIR, 'icon-512-maskable.png'));
  console.log('Wrote icon-512-maskable.png');
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
