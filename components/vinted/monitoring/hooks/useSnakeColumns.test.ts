import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSnakeColumns } from './useSnakeColumns';

function mockMatchMedia(initiallyMatches: boolean) {
  const listeners: Array<(e: { matches: boolean }) => void> = [];
  const mql = {
    matches: initiallyMatches,
    addEventListener: (_event: string, cb: (e: { matches: boolean }) => void) => listeners.push(cb),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));
  return {
    triggerChange: (matches: boolean) => {
      mql.matches = matches;
      listeners.forEach((cb) => cb({ matches }));
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useSnakeColumns', () => {
  it('returns 5 columns when the viewport is at least the sm breakpoint', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useSnakeColumns());
    expect(result.current).toBe(5);
  });

  it('returns 3 columns on a narrower viewport', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useSnakeColumns());
    expect(result.current).toBe(3);
  });

  it('updates when the viewport crosses the breakpoint', () => {
    const { triggerChange } = mockMatchMedia(false);
    const { result } = renderHook(() => useSnakeColumns());
    expect(result.current).toBe(3);
    act(() => triggerChange(true));
    expect(result.current).toBe(5);
  });
});
