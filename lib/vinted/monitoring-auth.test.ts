import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { assertVintedAccess } from './monitoring-auth';

const USER_A = '35385d3c-5966-4a10-8568-8d92d1be47e7';
const USER_B = 'a018a4ef-e02e-4a67-9732-9fafe3167e10';
const OUTSIDER = 'aaaaaaaa-0000-0000-0000-000000000000';

beforeEach(() => {
  process.env.VINTED_USER_IDS = `${USER_A},${USER_B}`;
});
afterEach(() => {
  delete process.env.VINTED_USER_IDS;
});

describe('assertVintedAccess', () => {
  it('allows a Vinted-enabled user to act on another Vinted-enabled user', () => {
    expect(() => assertVintedAccess(USER_A, USER_B)).not.toThrow();
  });

  it('allows a Vinted-enabled user to act on themselves', () => {
    expect(() => assertVintedAccess(USER_A, USER_A)).not.toThrow();
  });

  it('throws when the requester is not Vinted-enabled', () => {
    expect(() => assertVintedAccess(OUTSIDER, USER_A)).toThrow();
  });

  it('throws when the target is not Vinted-enabled', () => {
    expect(() => assertVintedAccess(USER_A, OUTSIDER)).toThrow();
  });
});
