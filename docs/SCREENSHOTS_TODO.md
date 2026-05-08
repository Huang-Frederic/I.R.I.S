# Screenshots checklist

The README and feature docs reference image files at fixed paths. This is the capture list.

> Save all images to `docs/screenshots/`. Use PNG for static UI, GIF or short MP4 for flows. Keep file size reasonable (< 500 KB per static image, < 2 MB per GIF).

## Recommended dimensions

- **Hero / banner shots**: 1600 × 900 (16:9), light theme + dark theme variants if you want
- **Mobile screenshots**: 375 × 812 (iPhone 13 viewport) or 390 × 844 (iPhone 14)
- **Desktop component shots**: 1280 × 720 or actual rendered size (via DevTools)
- **GIFs**: keep under 10 seconds, 800 px wide max

---

## README hero gallery (`docs/screenshots/`)

The README has two 4-column tables of feature shots. Required filenames:

| File | What to capture |
|---|---|
| `pokedex-grid.png` | `/pokedex` in grid-3 view, ~10 slots filled, identity badges visible |
| `stock-list.png` | `/stock` showing 5+ rows with count chips, Pokédex/Pas Pokédex tags |
| `vinted-list.png` | `/vinted` with state chips + at least one row showing `<ListingBadges>` for both users |
| `dashboard.png` | `/dashboard` full page — KPI strip + 4 charts + top rares |
| `scanner.png` | `/submit` Scanner tab mid-review, with magnifier loupe visible on the photo |
| `annonce-modal.png` | Annonce modal open, showing the templated description + copy button |
| `bulk-vendu.png` | `/vinted` with selection mode active, several rows checked, bottom bar visible |
| `lot-form.png` | `/submit` Lot tab with form filled + 3-photo dropzone preview |

---

## Optional GIFs (impactful for demos)

| File | What it should show |
|---|---|
| `scan-flow.gif` | Tap photo → OCR loading → enriched fields populate → save → toast confirm |
| `bulk-sold.gif` | Select 4 cards → bulk modal → enter total → live split → confirm → recap modal |
| `restock-chain.gif` | Mark for_sale as sold → restock toast → promote-after-sold modal → partner cleanup |
| `pokedex-replace.gif` | Scan a card whose Pokémon has a slot → replace modal → swap → drawer updates |
| `pwa-install-ios.gif` | iOS Safari → "Comment ?" banner → 3-step modal walkthrough |

---

## Capture tips

### Browser
- Use Chrome DevTools device toolbar for consistent viewport sizes.
- Disable browser autofill/history popups before capturing.
- For dark theme shots, set the theme in `/options` then capture.

### macOS
- `Cmd+Shift+4`, then space, click a window for clean window screenshots.
- `Cmd+Shift+5` for screen recording (export as MP4, convert to GIF if needed).

### GIF tools
- **macOS**: [Gifski](https://gif.ski/) or [Kap](https://getkap.co/).
- **Cross-platform**: [LICEcap](https://www.cockos.com/licecap/) or `ffmpeg` for conversion.

```bash
# Convert MP4 to optimized GIF (good quality, reasonable size)
ffmpeg -i input.mp4 -vf "fps=15,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" output.gif
```

### Privacy

Before capturing, verify nothing sensitive shows:
- Real card prices (or replace with seed data via `npx tsx scripts/seed/seed.ts`)
- Email addresses (sign in as the seeded test user)
- API keys in URL bars, DevTools, Network tab

---

## After capture

1. Drop the files into `docs/screenshots/` matching the names above.
2. Verify the README renders correctly: `cat README.md | grep "screenshots/"` should show every reference, and each file should now exist.
3. Commit them with the README update.

If you want to keep originals (PSD / RAW / source MP4) outside the repo, add the working folder to `.gitignore` and only commit the optimized versions.
