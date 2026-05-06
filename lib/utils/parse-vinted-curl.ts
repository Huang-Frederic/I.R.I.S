import type { VintedCurl } from '@/lib/types/vinted-import';

const URL_RE = /https:\/\/www\.vinted\.[a-z.]+\/api\/v2\/(?:users|wardrobe)\/(\d+)\/items/;

/**
 * Extract the headers we need from a `curl ...` command copied via Chrome
 * DevTools → Network → "Copy as cURL". Supports:
 *   - `-H 'cookie: ...'` (Linux/macOS bash format)
 *   - `-b '...'` (alternative cookie flag)
 *   - `^"..."` Windows cmd caret-escaping (we strip carets up-front)
 *
 * Endpoints accepted: `/api/v2/users/{id}/items` AND `/api/v2/wardrobe/{id}/items`
 * (Vinted exposes both — the latter is what their member-profile page uses).
 */
export function parseVintedCurl(curl: string): VintedCurl | null {
  // Windows "Copy as cURL (cmd)" uses `^` to escape `"`, `&`, `%`, etc.
  // Strip carets — they're always escapes in cmd format and don't appear
  // verbatim in Vinted cookies/tokens.
  const normalized = curl.replace(/\^/g, '');

  const urlMatch = normalized.match(URL_RE);
  if (!urlMatch) return null;
  const userId = urlMatch[1];

  const cookieMatch =
    normalized.match(/-H\s+['"]cookie:\s*([^'"]+)['"]/i) ??
    normalized.match(/-b\s+['"]([^'"]+)['"]/);
  if (!cookieMatch) return null;
  const cookie = cookieMatch[1].trim();

  const csrfMatch = normalized.match(/-H\s+['"]x-csrf-token:\s*([^'"]+)['"]/i);
  const csrfToken = csrfMatch ? csrfMatch[1].trim() : null;

  return { userId, cookie, csrfToken };
}
