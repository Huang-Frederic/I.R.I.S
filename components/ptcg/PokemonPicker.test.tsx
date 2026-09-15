import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PokemonPicker from './PokemonPicker';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function openPicker() {
  fireEvent.click(screen.getByRole('button', { name: 'profileSpriteLabel' }));
}

describe('<PokemonPicker>', () => {
  it('does not show the search field before the sprite circle is clicked', () => {
    render(<PokemonPicker value={null} onChange={() => {}} />);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('opens a picker showing the dex from the top when the sprite circle is clicked', () => {
    // The grid is virtualized (react-window) — only the rows near the top
    // are actually in the DOM until the user scrolls, so this asserts on
    // the first entry (#1) rather than the whole dex.
    render(<PokemonPicker value={null} onChange={() => {}} />);
    openPicker();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bulbizarre' })).toBeInTheDocument();
  });

  it('filters the grid by a French name query', () => {
    render(<PokemonPicker value={null} onChange={() => {}} />);
    openPicker();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'dracaufeu' } });
    expect(screen.getByRole('button', { name: 'Dracaufeu' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bulbizarre' })).toBeNull();
  });

  it('filters the grid by an English name query', () => {
    render(<PokemonPicker value={null} onChange={() => {}} />);
    openPicker();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'charizard' } });
    expect(screen.getByRole('button', { name: 'Dracaufeu' })).toBeInTheDocument();
  });

  it('picks a Pokémon, closes the picker, and clears the query', () => {
    const onChange = vi.fn();
    render(<PokemonPicker value={null} onChange={onChange} />);
    openPicker();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'dracaufeu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dracaufeu' }));
    expect(onChange).toHaveBeenCalledWith(6);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('renders the picked sprite on the trigger circle', () => {
    render(<PokemonPicker value={6} onChange={() => {}} />);
    const trigger = screen.getByRole('button', { name: 'profileSpriteLabel' });
    const img = trigger.querySelector('img');
    expect(img?.src).toContain('/6.png');
  });
});
