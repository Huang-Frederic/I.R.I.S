import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SoldModal from './SoldModal';
import type { OtherItem } from '@/lib/types';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

const fetchMock = vi.fn();
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('<SoldModal> for an Item', () => {
  it('marks the item sold through the Items route and reports it back', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ item: { id: 'item-1', status: 'sold' } }) });
    const onSold = vi.fn();
    const item = { id: 'item-1', name: "Sacoche Men's Classic - Lacoste" } as OtherItem;
    render(<SoldModal entity={{ kind: 'other_item', item }} onClose={() => {}} onSold={onSold} />);

    expect(screen.getByText("Sacoche Men's Classic - Lacoste")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('salePriceLabel'), { target: { value: '35' } });
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));

    await waitFor(() => expect(onSold).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/other-items/item-1');
    expect(JSON.parse(init.body)).toMatchObject({ status: 'sold', sold_price: 35 });
    expect(onSold.mock.calls[0][0]).toMatchObject({ soldId: 'item-1', kind: 'other_item' });
  });
});
