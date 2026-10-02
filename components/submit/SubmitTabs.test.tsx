import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import frMessages from '@/messages/fr.json';
import SubmitTabs from './SubmitTabs';
import { useUserContext } from '@/lib/hooks/useUserContext';
import { FRED_USER_ID } from '@/lib/vinted/other-item-queue-sync';

// SubmitTabs always mounts the active tab's form (defaulting to "batch"),
// and those forms pull in heavy, unrelated dependencies (next/navigation's
// router, camera access, Supabase…). Stub them out so this suite stays
// focused on the tab bar's Fred-only gating logic.
vi.mock('./BatchForm', () => ({ default: () => <div data-testid="batch-form" /> }));
vi.mock('./OtherForm', () => ({ default: () => <div data-testid="other-form" /> }));
vi.mock('../other-items/OtherItemForm', () => ({
  default: () => <div data-testid="other-item-form" />,
}));

vi.mock('@/lib/hooks/useUserContext', () => ({ useUserContext: vi.fn() }));

// Real NextIntlClientProvider + the actual fr.json messages (rather than
// the usual `key => key` passthrough mock) so the assertions below can
// match the real translated "Objets" tab label, not its translation key.
function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      <SubmitTabs />
    </NextIntlClientProvider>,
  );
}

describe('<SubmitTabs> Fred-only "Objets" tab gating', () => {
  it('shows the "Objets" tab when the signed-in user is Fred', () => {
    vi.mocked(useUserContext).mockReturnValue({
      myUserId: FRED_USER_ID,
      myName: 'Fred',
      partnerUserId: null,
      partnerName: null,
    });
    renderWithIntl();
    expect(screen.getByText('Objets')).toBeInTheDocument();
  });

  it('hides the "Objets" tab for a non-Fred user', () => {
    vi.mocked(useUserContext).mockReturnValue({
      myUserId: 'some-other-user-id',
      myName: 'Gilly',
      partnerUserId: null,
      partnerName: null,
    });
    renderWithIntl();
    expect(screen.queryByText('Objets')).toBeNull();
  });
});
