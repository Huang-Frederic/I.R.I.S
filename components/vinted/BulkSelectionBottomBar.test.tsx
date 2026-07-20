import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import BulkSelectionBottomBar from './BulkSelectionBottomBar';

// Pass keys through so no NextIntlClientProvider is needed (same pattern as
// PriceWithTrend.test.tsx). Labels assert on the key names.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const noop = () => {};

describe('<BulkSelectionBottomBar>', () => {
  it('shows the trade button for a cards-only selection (Vinted mode)', () => {
    render(
      <BulkSelectionBottomBar cardCount={3} lotCount={0} onCancel={noop} onConfirm={noop} onTrade={noop} />,
    );
    expect(screen.getByText('bottomBarTrade')).toBeInTheDocument();
    expect(screen.getByText('bottomBarSell')).toBeInTheDocument();
  });

  it('hides the trade button as soon as a lot is selected (trades are cards-only)', () => {
    render(
      <BulkSelectionBottomBar cardCount={3} lotCount={1} onCancel={noop} onConfirm={noop} onTrade={noop} />,
    );
    expect(screen.queryByText('bottomBarTrade')).toBeNull();
    expect(screen.getByText('bottomBarSell')).toBeInTheDocument();
  });

  it('trade-only mode (/stock): no sell button, trade takes the primary style', () => {
    render(<BulkSelectionBottomBar cardCount={2} lotCount={0} onCancel={noop} onTrade={noop} />);
    expect(screen.queryByText('bottomBarSell')).toBeNull();
    expect(screen.getByText('bottomBarTrade')).toBeInTheDocument();
  });

  it('renders nothing with an empty selection', () => {
    const { container } = render(
      <BulkSelectionBottomBar cardCount={0} lotCount={0} onCancel={noop} onConfirm={noop} onTrade={noop} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
