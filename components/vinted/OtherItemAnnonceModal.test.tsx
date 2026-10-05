import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import OtherItemAnnonceModal from './OtherItemAnnonceModal';
import { makeOtherItem } from '@/lib/utils/test-fixtures';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/components/other-items/hooks/useCatalogAttributes', () => ({
  useCatalogAttributes: () => ({
    state: {
      status: 'ready',
      attributes: {
        catalog_id: 2614,
        status: 'ready',
        size_options: [{ title: 'S/M/L', options: [{ id: 1739, title: 'M' }, { id: 1740, title: 'L' }] }],
        size_required: true,
        condition_options: [{ id: 6, title: 'Neuf avec étiquette' }, { id: 2, title: 'Très bon état' }],
        has_color: true,
        error: null,
      },
    },
    retry: vi.fn(),
  }),
}));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

function renderModal(onItemSaved = vi.fn()) {
  const item = {
    ...makeOtherItem({ id: 'item-1', name: 'Doudoune Uniqlo', vinted_catalog_id: 2614, vinted_condition_id: 2 }),
    listings: [],
  };
  render(
    <OtherItemAnnonceModal
      item={item}
      storagePublicUrl={(p) => p}
      onClose={vi.fn()}
      onPriceSaved={vi.fn()}
      onItemDeleted={vi.fn()}
      onItemSaved={onItemSaved}
    />,
  );
  return { item, onItemSaved };
}

describe('<OtherItemAnnonceModal> Vinted attributes', () => {
  it("flags what the item's category still asks for", () => {
    renderModal();
    expect(screen.getByText('errorSize')).toBeInTheDocument();
    expect(screen.getByText('errorColor')).toBeInTheDocument();
  });

  it('saves the condition, size and colors, then refreshes the description preview', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ item: { vinted_condition_id: 2, vinted_size_id: 1740, size: 'L', vinted_color_ids: [1] } }),
    });
    const { onItemSaved } = renderModal();

    fireEvent.change(screen.getByLabelText('sizeLabel'), { target: { value: '1740' } });
    fireEvent.click(screen.getByRole('button', { name: 'Noir' }));
    fireEvent.click(screen.getByRole('button', { name: 'vintedFieldsSave' }));

    await waitFor(() => expect(onItemSaved).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/other-items/item-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ vinted_condition_id: 2, vinted_size_id: 1740, size: 'L', vinted_color_ids: [1] });
    expect(onItemSaved.mock.calls[0][0]).toMatchObject({ id: 'item-1', vinted_size_id: 1740, size: 'L', vinted_color_ids: [1] });
    expect(screen.getByDisplayValue(/📏 Taille : L/)).toBeInTheDocument();
    expect(screen.getByText('vintedFieldsSaved')).toBeInTheDocument();
  });

  it('keeps the save button disabled while nothing changed', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'vintedFieldsSave' })).toBeDisabled();
  });

  it('says when the save failed', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Noir' }));
    fireEvent.click(screen.getByRole('button', { name: 'vintedFieldsSave' }));
    await waitFor(() => expect(screen.getByText('vintedFieldsSaveError')).toBeInTheDocument());
  });
});
