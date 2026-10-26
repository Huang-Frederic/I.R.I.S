import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRealtimeListingsRefresh } from './useRealtimeListingsRefresh';

const supabaseMock = { channel: vi.fn(), removeChannel: vi.fn() };
vi.mock('@/lib/supabase/client', () => ({ createClient: () => supabaseMock }));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

function mockChannel() {
  const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };
  supabaseMock.channel.mockReturnValue(channel);
  return channel;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('useRealtimeListingsRefresh', () => {
  it('subscribes to card_listings, lot_listings and other_item_listings, scoped to the given user', () => {
    const channel = mockChannel();
    renderHook(() => useRealtimeListingsRefresh('user-1'));
    expect(supabaseMock.channel).toHaveBeenCalledWith('listings-user-1');
    for (const table of ['card_listings', 'lot_listings', 'other_item_listings']) {
      expect(channel.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({ table, filter: 'user_id=eq.user-1' }),
        expect.any(Function),
      );
    }
  });

  it('debounces a lot_listings change into a single refresh after 2s', () => {
    const channel = mockChannel();
    renderHook(() => useRealtimeListingsRefresh('user-1'));
    const lotHandler = channel.on.mock.calls.find((c) => c[1].table === 'lot_listings')![2];

    lotHandler();
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('debounces an other_item_listings change the same way', () => {
    const channel = mockChannel();
    renderHook(() => useRealtimeListingsRefresh('user-1'));
    const itemHandler = channel.on.mock.calls.find((c) => c[1].table === 'other_item_listings')![2];

    itemHandler();
    vi.advanceTimersByTime(2000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe when myUserId is empty', () => {
    renderHook(() => useRealtimeListingsRefresh(''));
    expect(supabaseMock.channel).not.toHaveBeenCalled();
  });

  it('removes the channel on unmount', () => {
    mockChannel();
    const { unmount } = renderHook(() => useRealtimeListingsRefresh('user-1'));
    unmount();
    expect(supabaseMock.removeChannel).toHaveBeenCalled();
  });
});
