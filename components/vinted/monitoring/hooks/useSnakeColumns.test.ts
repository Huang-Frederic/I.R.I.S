import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSnakeColumns, computeColumnsForWidth } from './useSnakeColumns';

function makeContainer(clientWidth: number): HTMLDivElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: clientWidth });
  return element;
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
    const { result } = renderHook(() => useSnakeColumns(makeContainer(500)));
    // 3 cards of 136px + 2 connectors of 32px = 472px; a 4th needs 168 more (640px) — 500px fits 3.
    expect(result.current).toBe(3);
  });

  it('uses the wider sm card width once that breakpoint matches', () => {
    mockMatchMedia({ '(min-width: 640px)': true, '(min-width: 1024px)': false });
    const { result } = renderHook(() => useSnakeColumns(makeContainer(600)));
    // 3 cards of 152px + 2 connectors of 32px = 520px; a 4th needs 184 more (704px) — 600px fits 3.
    expect(result.current).toBe(3);
  });

  it('uses the widest lg card width once that breakpoint matches', () => {
    mockMatchMedia({ '(min-width: 640px)': true, '(min-width: 1024px)': true });
    const { result } = renderHook(() => useSnakeColumns(makeContainer(1000)));
    // 5 cards of 172px + 4 connectors of 32px = 988px; a 6th needs 204 more (1192px) — 1000px fits 5.
    expect(result.current).toBe(5);
  });

  it('recomputes the card-width tier when the viewport crosses the sm breakpoint', () => {
    const { triggerChange } = mockMatchMedia({ '(min-width: 640px)': false, '(min-width: 1024px)': false });
    const container = makeContainer(320);
    const { result } = renderHook(() => useSnakeColumns(container));
    // 320px at the base 136px tier: 2 cards + 1 connector = 304px; a 3rd needs 168 more (472px) — fits 2.
    expect(result.current).toBe(2);
    act(() => triggerChange('(min-width: 640px)', true));
    // Same 320px container, now measured at the wider 152px tier: a 2nd card+connector needs 184 more (336px) — only fits 1.
    expect(result.current).toBe(1);
  });

  it('falls back to 3 columns when there is no container yet', () => {
    mockMatchMedia({ '(min-width: 640px)': false, '(min-width: 1024px)': false });
    const { result } = renderHook(() => useSnakeColumns(null));
    expect(result.current).toBe(3);
  });

  it('measures the real width once the container becomes available after starting as null (regression: an async-loaded list renders empty on first paint, then mounts its container once data arrives — the hook must not get stuck at the fallback forever)', () => {
    mockMatchMedia({ '(min-width: 640px)': true, '(min-width: 1024px)': true });
    const { result, rerender } = renderHook(({ container }) => useSnakeColumns(container), {
      initialProps: { container: null as HTMLDivElement | null },
    });
    expect(result.current).toBe(3); // fallback, no container yet

    rerender({ container: makeContainer(1000) });
    // 5 cards of 172px + 4 connectors of 32px = 988px; a 6th needs 204 more (1192px) — 1000px fits 5.
    expect(result.current).toBe(5);
  });
});
