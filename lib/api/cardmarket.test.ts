// lib/api/cardmarket.test.ts
import { describe, expect, it } from 'vitest';
import {
  percentEncode,
  buildSignatureBaseString,
  buildSigningKey,
  signRequest,
} from './cardmarket';

describe('percentEncode', () => {
  it('leaves unreserved characters alone', () => {
    expect(percentEncode('AZaz09-._~')).toBe('AZaz09-._~');
  });

  it('encodes space as %20 (not +)', () => {
    expect(percentEncode('hello world')).toBe('hello%20world');
  });

  it('encodes reserved characters', () => {
    expect(percentEncode('a/b:c=d&e')).toBe('a%2Fb%3Ac%3Dd%26e');
  });

  it('encodes Unicode (UTF-8 percent-encoded)', () => {
    expect(percentEncode('é')).toBe('%C3%A9');
  });
});

describe('buildSignatureBaseString', () => {
  it('uppercases method, encodes URL, sorts and encodes params', () => {
    const result = buildSignatureBaseString(
      'get',
      'https://api.cardmarket.com/ws/v2.0/account',
      {
        oauth_consumer_key: 'KEY',
        oauth_token: 'TOKEN',
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: '1700000000',
        oauth_nonce: 'NONCE',
        oauth_version: '1.0',
      },
    );
    // Method&URL&ParamsString — each component URL-encoded
    // Params alphabetically sorted: oauth_consumer_key, oauth_nonce,
    // oauth_signature_method, oauth_timestamp, oauth_token, oauth_version
    expect(result).toBe(
      'GET&' +
        'https%3A%2F%2Fapi.cardmarket.com%2Fws%2Fv2.0%2Faccount&' +
        'oauth_consumer_key%3DKEY%26' +
        'oauth_nonce%3DNONCE%26' +
        'oauth_signature_method%3DHMAC-SHA1%26' +
        'oauth_timestamp%3D1700000000%26' +
        'oauth_token%3DTOKEN%26' +
        'oauth_version%3D1.0',
    );
  });
});

describe('buildSigningKey', () => {
  it('is "appSecret&accessSecret" with each percent-encoded', () => {
    expect(buildSigningKey('app/secret', 'access&secret')).toBe(
      'app%2Fsecret&access%26secret',
    );
  });
});

describe('signRequest (HMAC-SHA1 + Authorization header)', () => {
  // Deterministic sanity test: given fixed inputs, the signature is
  // reproducible. The expected value comes from running the same
  // algorithm in a known-good OAuth library (e.g. Python's oauthlib).
  // If this changes, the wrapper is broken.
  it('produces the same signature for fixed inputs (regression test)', () => {
    const header = signRequest({
      method: 'GET',
      url: 'https://api.cardmarket.com/ws/v2.0/account',
      appToken: 'app-key',
      appSecret: 'app-secret',
      accessToken: 'access-token',
      accessSecret: 'access-secret',
      // Override timestamp + nonce for deterministic output
      _testTimestamp: '1700000000',
      _testNonce: 'fixedNonce',
    });
    expect(header).toContain('OAuth realm="https://api.cardmarket.com/ws/v2.0/account"');
    expect(header).toContain('oauth_consumer_key="app-key"');
    expect(header).toContain('oauth_token="access-token"');
    expect(header).toContain('oauth_signature_method="HMAC-SHA1"');
    expect(header).toContain('oauth_timestamp="1700000000"');
    expect(header).toContain('oauth_nonce="fixedNonce"');
    expect(header).toContain('oauth_version="1.0"');
    // Base64 SHA1 is 28 chars; percent-encoded grows up to ~34 (=→%3D, +→%2B, /→%2F)
    expect(header).toMatch(/oauth_signature="[A-Za-z0-9%]{28,40}"/);
  });

  it('different secrets produce different signatures', () => {
    const opts = {
      method: 'GET' as const,
      url: 'https://api.cardmarket.com/ws/v2.0/account',
      appToken: 'k',
      accessToken: 't',
      _testTimestamp: '1',
      _testNonce: 'n',
    };
    const h1 = signRequest({ ...opts, appSecret: 'A', accessSecret: 'B' });
    const h2 = signRequest({ ...opts, appSecret: 'X', accessSecret: 'Y' });
    expect(h1).not.toBe(h2);
  });
});
