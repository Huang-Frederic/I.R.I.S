interface Props {
  url: string | null;
}

/**
 * Tiny inline link to the matched Cardmarket product page. Renders nothing
 * when `url` is missing — happens for cards whose expansion hasn't been
 * scraped yet, or that fell back to TCGdex pricing.
 *
 * Used as a sanity check: clicking opens the exact CM page that fed the
 * displayed prices, so the user can verify the lookup picked the right print.
 */
export default function CardmarketLink({ url }: Props) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors"
      title="Ouvrir la fiche Cardmarket dans un nouvel onglet"
      onClick={(e) => e.stopPropagation()}
    >
      voir sur Cardmarket ↗
    </a>
  );
}
