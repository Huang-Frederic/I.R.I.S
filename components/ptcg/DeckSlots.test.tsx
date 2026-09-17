import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DeckSlots from './DeckSlots';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('<DeckSlots>', () => {
  it('renders exactly 2 picker slots for an empty dex array', () => {
    render(<DeckSlots label="My deck" dex={[]} onChange={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('renders exactly 2 picker slots for a single-entry dex array', () => {
    render(<DeckSlots label="My deck" dex={[157]} onChange={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('renders exactly 2 picker slots for a full 2-entry dex array', () => {
    render(<DeckSlots label="My deck" dex={[157, 156]} onChange={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('renders the given label', () => {
    render(<DeckSlots label="Opponent's deck" dex={[]} onChange={() => {}} />);
    expect(screen.getByText("Opponent's deck")).toBeInTheDocument();
  });
});
