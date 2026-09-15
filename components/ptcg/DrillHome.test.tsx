import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DrillHome from './DrillHome';
import type { DrillProfileRow } from '@/lib/types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const profile: DrillProfileRow = {
  id: 'p1',
  user_id: 'u',
  name: 'Typhlosion',
  cards: [{ id: 'DRI-32', name: 'Héricendre de Luth', count: 4, category: 'poke' }],
  target_ids: ['DRI-32'],
  pokemon_number: 157,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('<DrillHome> row menu', () => {
  it('hides edit/delete behind a closed menu by default', () => {
    render(<DrillHome initialProfiles={[profile]} />);
    expect(screen.queryByText('editProfile')).toBeNull();
    expect(screen.queryByText('deleteProfile')).toBeNull();
  });

  it('opens the menu to reveal edit and delete', () => {
    render(<DrillHome initialProfiles={[profile]} />);
    fireEvent.click(screen.getByLabelText('moreActions'));
    expect(screen.getByText('editProfile')).toBeInTheDocument();
    expect(screen.getByText('deleteProfile')).toBeInTheDocument();
  });

  it('closes the menu after picking edit', () => {
    render(<DrillHome initialProfiles={[profile]} />);
    fireEvent.click(screen.getByLabelText('moreActions'));
    fireEvent.click(screen.getByText('editProfile'));
    expect(screen.queryByText('deleteProfile')).toBeNull();
  });

  it('places the menu trigger before the start button', () => {
    render(<DrillHome initialProfiles={[profile]} />);
    const buttons = screen.getAllByRole('button');
    const menuIndex = buttons.findIndex((b) => b.getAttribute('aria-label') === 'moreActions');
    const startIndex = buttons.findIndex((b) => b.textContent?.includes('startDrill'));
    expect(menuIndex).toBeGreaterThan(-1);
    expect(startIndex).toBeGreaterThan(-1);
    expect(menuIndex).toBeLessThan(startIndex);
  });
});
