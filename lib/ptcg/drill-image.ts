/**
 * The image to show for a Drill tile. TCGdex stores card art without an
 * extension (the size and format are appended at render: `…/low.webp`), while
 * the catalog the Drill resolves decklists against (`tcg_catalog`) holds
 * complete LimitlessTCG files (`…_LG.png`), which are used as they are.
 */
export function drillImageSrc(url: string): string {
  return /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(url) ? url : `${url}/low.webp`;
}
