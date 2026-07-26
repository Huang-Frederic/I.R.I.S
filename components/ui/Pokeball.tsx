/**
 * The CSS Pokéball, drawn from theme tokens.
 *
 * Extracted from the mobile nav's centre button so a second surface can use the
 * same shape rather than inventing another import icon. BottomNav still draws
 * its own — it carries spin state and a bespoke shadow, and rewiring a working
 * nav for a shared 25 lines is not worth the risk.
 */
export default function Pokeball({ size = 28 }: { size?: number }) {
  const band = Math.max(2, Math.round(size * 0.1));
  const ring = Math.max(1.5, size * 0.05);
  const hub = Math.round(size * 0.33);

  return (
    <span className="relative block rounded-full" style={{ height: size, width: size }} aria-hidden>
      {/* Dark cap over a red base */}
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background: 'linear-gradient(var(--pokeball-dark) 0 50%, var(--color-red) 50% 100%)',
        }}
      />
      {/* Equator band */}
      <span
        className="absolute inset-x-0 top-1/2 -translate-y-1/2"
        style={{ height: band, background: 'var(--pokeball-line)' }}
      />
      {/* Outline, drawn last so it caps the band ends */}
      <span
        className="absolute inset-0 rounded-full"
        style={{ border: `${ring}px solid var(--pokeball-line)` }}
      />
      {/* Centre button */}
      <span
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          height: hub,
          width: hub,
          background: 'var(--pokeball-hub)',
          border: `${ring}px solid var(--pokeball-line)`,
        }}
      />
    </span>
  );
}
