import { describe, expect, it } from 'vitest';
import { parseVintedCurl } from './parse-vinted-curl';

const SAMPLE_CURL_LINUX = `curl 'https://www.vinted.fr/api/v2/users/12345678/items?per_page=20&page=1&order=relevance' \\
  -H 'accept: application/json, text/plain, */*' \\
  -H 'cookie: _vinted_fr_session=abc123def456; v_sid=xyz' \\
  -H 'x-csrf-token: csrf-token-here' \\
  -H 'user-agent: Mozilla/5.0' \\
  --compressed`;

describe('parseVintedCurl', () => {
  it('extracts userId, cookie and csrfToken from a valid curl', () => {
    const result = parseVintedCurl(SAMPLE_CURL_LINUX);
    expect(result).toEqual({
      userId: '12345678',
      cookie: '_vinted_fr_session=abc123def456; v_sid=xyz',
      csrfToken: 'csrf-token-here',
    });
  });

  it('returns null when the URL is not a Vinted /api/v2/users endpoint', () => {
    const curl = `curl 'https://www.example.com/foo' -H 'cookie: x=y'`;
    expect(parseVintedCurl(curl)).toBeNull();
  });

  it('returns null when the cookie header is missing', () => {
    const curl = `curl 'https://www.vinted.fr/api/v2/users/123/items' -H 'accept: */*'`;
    expect(parseVintedCurl(curl)).toBeNull();
  });

  it('parses Windows-style curl with -b cookie flag', () => {
    const curl = `curl "https://www.vinted.fr/api/v2/users/999/items?page=1" -b "_vinted_fr_session=winabc"`;
    const result = parseVintedCurl(curl);
    expect(result?.userId).toBe('999');
    expect(result?.cookie).toBe('_vinted_fr_session=winabc');
    expect(result?.csrfToken).toBeNull();
  });
});
