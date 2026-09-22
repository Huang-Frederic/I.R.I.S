import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createRef } from 'react';
import { useSnakeColumns, computeColumnsForWidth } from './useSnakeColumns';

function makeContainerRef(clientWidth: number) {
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: clientWidth });
  const ref = createRef<HTMLDivElement>();
  // React 19's createRef() returns `current` as non-configurable (but still writable), so
  // Object.defineProperty would throw here — a plain assignment works instead.
  ref.current = element;
  return ref;
}

function mockMatchMedia(initial: Record<string, boolean>) {
  const state: Record<string, boolean> = { ...initial };
  const listeners = new Map<string, Array<(e: { matches: boolean }) => void>>();
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      get matches() {
        return state[query] ?? false;
      },
      addEventListener: (_event: string, cb: (e: { matches: boolean }) => void) => {
        const list = listeners.get(query) ?? [];
        list.push(cb);
        listeners.set(query, list);
      },
      removeEventListener: vi.fn(),
    })),
  );
  return {
    triggerChange: (query: string, matches: boolean) => {
      state[query] = matches;
      (listeners.get(query) ?? []).forEach((cb) => cb({ matches }));
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('computeColumnsForWidth', () => {
  it('fits as many card-widths (plus connector slots) as the available width allows', () => {
    // 3 cards of 124px + 2 connector slots of 32px = 436px; a 4th card+connector needs 156 more (592px).
    expect(computeColumnsForWidth(500, 124, 32)).toBe(3);
  });

  it('rounds down to the previous whole column when the width falls just short of the next one', () => {
    expect(computeColumnsForWidth(591, 124, 32)).toBe(3);
    expect(computeColumnsForWidth(592, 124, 32)).toBe(4);
  });

  it('never returns fewer than 1 column, even with no space at all', () => {
    expect(computeColumnsForWidth(0, 124, 32)).toBe(1);
    expect(computeColumnsForWidth(-50, 124, 32)).toBe(1);
  });
});

describe('useSnakeColumns', () => {
  it('computes columns from the container width using the base card width below the sm breakpoint', () => {
    mockMatchMedia({ '(min-width: 640px)': false, '(min-width: 1024px)': false });
    const ref = makeContainerRef(500);
    const { result } = renderHook(() => useSnakeColumns(ref));
    expect(result.current).toBe(3);
  });

  it('uses the wider sm card width once that breakpoint matches', () => {
    mockMatchMedia({ '(min-width: 640px)': true, '(min-width: 1024px)': false });
    const ref = makeContainerRef(600);
    const { result } = renderHook(() => useSnakeColumns(ref));
    // 3 cards of 140px + 2 connectors of 32px = 484px; a 4th needs 172 more (656px) — 600px fits 3.
    expect(result.current).toBe(3);
  });

  it('uses the widest lg card width once that breakpoint matches', () => {
    mockMatchMedia({ '(min-width: 640px)': true, '(min-width: 1024px)': true });
    const ref = makeContainerRef(1000);
    const { result } = renderHook(() => useSnakeColumns(ref));
    // 5 cards of 160px + 4 connectors of 32px = 928px; a 6th needs 192 more (1120px) — 1000px fits 5.
    expect(result.current).toBe(5);
  });

  it('recomputes the card-width tier when the viewport crosses the sm breakpoint', () => {
    const { triggerChange } = mockMatchMedia({ '(min-width: 640px)': false, '(min-width: 1024px)': false });
    const ref = makeContainerRef(300);
    const { result } = renderHook(() => useSnakeColumns(ref));
    // 300px at the base 124px tier: 1 card (124) + 0 connectors, a 2nd needs 156 more (280px) — fits 2.
    expect(result.current).toBe(2);
    act(() => triggerChange('(min-width: 640px)', true));
    // Same 300px container, now measured at the wider 140px tier: a 2nd card+connector needs 172 more (312px) — only fits 1.
    expect(result.current).toBe(1);
  });

  it('falls back to 3 columns when the container ref has not mounted yet', () => {
    mockMatchMedia({ '(min-width: 640px)': false, '(min-width: 1024px)': false });
    const ref = createRef<HTMLDivElement>();
    const { result } = renderHook(() => useSnakeColumns(ref));
    expect(result.current).toBe(3);
  });
});
