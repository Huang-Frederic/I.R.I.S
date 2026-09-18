/**
 * Decodes a JWT's payload and returns its `exp` claim (unix seconds), or
 * null if the token isn't a well-formed JWT or has no exp claim. Never
 * verifies the signature — this is a client-visible expiry hint, not a
 * security boundary, used to warn when a Vinted session needs refreshing.
 */
export function decodeJwtExpiry(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}
