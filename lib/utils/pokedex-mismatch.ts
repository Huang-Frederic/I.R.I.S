/**
 * Pokémon-number mismatch detector for the locked-slot scanner flow.
 *
 * When the user opens the Pokédex drawer on a missing slot (e.g. #387
 * Herbizarre) and scans a card, we must hard-block the save if the photo
 * actually shows a different Pokémon (e.g. #391 Simiabraz). The form's
 * pokemon_number field stays pinned to the locked value for UX clarity, so
 * the comparison happens on the *detected* number — surfaced separately by
 * Gemini OCR or by the catalogue match.
 *
 * Pure helper so the rule is easy to test and reuse.
 */

export function detectNumberMismatch(args: {
  /** The slot's expected pokémon number (when the form is locked). */
  lockedPokemonNumber: number | undefined;
  /** The pokémon number actually detected from the scan / enrichment. */
  detectedPokemonNumber: number | null;
}): boolean {
  if (args.lockedPokemonNumber === undefined) return false;
  if (args.detectedPokemonNumber === null) return false;
  return args.detectedPokemonNumber !== args.lockedPokemonNumber;
}
