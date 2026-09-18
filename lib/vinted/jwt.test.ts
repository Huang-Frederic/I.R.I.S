// lib/vinted/jwt.test.ts
import { describe, expect, it } from 'vitest';
import { decodeJwtExpiry } from './jwt';

function makeJwt(payload: object): string {
  const b64 = (obj: object) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.signature`;
}

describe('decodeJwtExpiry', () => {
  it('extracts the exp claim from a well-formed JWT', () => {
    expect(decodeJwtExpiry(makeJwt({ exp: 1234567890 }))).toBe(1234567890);
  });

  it('returns null for a token with no exp claim', () => {
    expect(decodeJwtExpiry(makeJwt({ sub: 'user-1' }))).toBeNull();
  });

  it('returns null for a malformed token (not 3 dot-separated parts)', () => {
    expect(decodeJwtExpiry('not-a-jwt')).toBeNull();
  });

  it('returns null when the payload segment is not valid base64/JSON', () => {
    expect(decodeJwtExpiry('abc.!!!invalid!!!.def')).toBeNull();
  });
});
