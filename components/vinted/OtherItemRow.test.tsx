import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import OtherItemRow from './OtherItemRow';
import type { OtherItemWithListings } from '@/lib/types';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/components/vinted/EditablePriceCell', () => ({ default: () => null }));

describe('<OtherItemRow>', () => {
  it('offers a Sold button that hands the item to the sold flow', () => {
    const item = { id: 'item-1', name: 'Sacoche Lacoste', brand_name: null, photo_urls: [], price: 40, listings: [] } as unknown as OtherItemWithListings;
    const onSoldClick = vi.fn();
    render(
      <ul>
        <OtherItemRow item={item} storagePublicUrl={(p) => p} myUserId="u" onPriceSaved={() => {}} onAnnonceClick={() => {}} onSoldClick={onSoldClick} />
      </ul>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'rowSoldButton' }));
    expect(onSoldClick).toHaveBeenCalledWith(item);
  });
});
