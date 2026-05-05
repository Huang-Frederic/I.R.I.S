import type { VintedCurl } from '@/lib/types/vinted-import';

const URL_RE = /https:\/\/www\.vinted\.[a-z.]+\/api\/v2\/users\/(\d+)\/items/;

/**
 * Extract the headers we need from a `curl ...` command copied via Chrome
 * DevTools → Network → "Copy as cURL". Supports both `-H 'cookie: ...'`
 * (Linux/macOS) and `-b '...'` (Windows alternative).
 */
export function parseVintedCurl(curl: string): VintedCurl | null {
  const urlMatch = curl.match(URL_RE);
  if (!urlMatch) return null;
  const userId = urlMatch[1];

  const cookieMatch =
    curl.match(/-H\s+['"]cookie:\s*([^'"]+)['"]/i) ??
    curl.match(/-b\s+['"]([^'"]+)['"]/);
  if (!cookieMatch) return null;
  const cookie = cookieMatch[1].trim();

  const csrfMatch = curl.match(/-H\s+['"]x-csrf-token:\s*([^'"]+)['"]/i);
  const csrfToken = csrfMatch ? csrfMatch[1].trim() : null;

  return { userId, cookie, csrfToken };
}
