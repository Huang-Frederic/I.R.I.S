import { describe, expect, it } from 'vitest';
import { colorForUserName, chipClassesForColor, badgeClassesForColor } from './user-colors';

describe('colorForUserName', () => {
  it('maps Lui → lui (case-insensitive, trims whitespace)', () => {
    expect(colorForUserName('Lui')).toBe('lui');
    expect(colorForUserName('lui')).toBe('lui');
    expect(colorForUserName('  LUI  ')).toBe('lui');
  });

  it('maps Elle → elle', () => {
    expect(colorForUserName('Elle')).toBe('elle');
    expect(colorForUserName('ELLE')).toBe('elle');
  });

  it('falls back to neutral for unknown names + null', () => {
    expect(colorForUserName(null)).toBe('neutral');
    expect(colorForUserName(undefined)).toBe('neutral');
    expect(colorForUserName('')).toBe('neutral');
    expect(colorForUserName('Bob')).toBe('neutral');
  });
});

describe('chipClassesForColor', () => {
  it('active state uses tinted bg/border/text per color', () => {
    expect(chipClassesForColor('lui', true)).toContain('bg-user-lui/20');
    expect(chipClassesForColor('lui', true)).toContain('text-user-lui');
    expect(chipClassesForColor('elle', true)).toContain('bg-user-elle/20');
    expect(chipClassesForColor('neutral', true)).toContain('bg-red-bg');
  });

  it('inactive state is the same neutral muted look across all colors', () => {
    const inactive = chipClassesForColor('neutral', false);
    expect(chipClassesForColor('lui', false)).toBe(inactive);
    expect(chipClassesForColor('elle', false)).toBe(inactive);
  });
});

describe('badgeClassesForColor', () => {
  it('returns user-tinted badge classes', () => {
    expect(badgeClassesForColor('lui')).toContain('bg-user-lui/20');
    expect(badgeClassesForColor('elle')).toContain('bg-user-elle/20');
    expect(badgeClassesForColor('neutral')).toContain('bg-rarity-r/20');
  });
});
