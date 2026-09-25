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
    expect(img?.src).toContain('/charizard.png');
  });

  it('encodes the pick as a Mega form when the Mega toggle is checked', () => {
    const onChange = vi.fn();
    render(<PokemonPicker value={null} onChange={onChange} />);
    openPicker();
    fireEvent.click(screen.getByRole('checkbox', { name: 'megaToggleLabel' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'amphinobi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Amphinobi' }));
    // 10658 = encodeMegaDex(658) — Amphinobi (Greninja) is dex 658.
    expect(onChange).toHaveBeenCalledWith(10658);
  });

  it('shows the Mega sprite in the grid itself once the Mega toggle is checked, not just after picking', () => {
    // Regression: checking "Méga" changed nothing visible in the grid before
    // this — every tile kept the base-form sprite, so the toggle looked
    // like it did nothing until after a pick was already made.
    render(<PokemonPicker value={null} onChange={() => {}} />);
    openPicker();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'amphinobi' } });
    const before = screen.getByRole('button', { name: 'Amphinobi' }).querySelector('img');
    expect(before?.src).toContain('/greninja.png');

    fireEvent.click(screen.getByRole('checkbox', { name: 'megaToggleLabel' }));
    // Re-queried, not the captured `before` node — react-window's row
    // renderer doesn't guarantee the same DOM node survives a re-render.
    const after = screen.getByRole('button', { name: 'Amphinobi' }).querySelector('img');
    expect(after?.src).toContain('/greninja-mega.png');
  });

  it('falls back to the base sprite in the grid if the Mega sprite 404s (most species have no Mega form)', () => {
    render(<PokemonPicker value={null} onChange={() => {}} />);
    openPicker();
    fireEvent.click(screen.getByRole('checkbox', { name: 'megaToggleLabel' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'bulbizarre' } });
    const img = screen.getByRole('button', { name: 'Bulbizarre' }).querySelector('img') as HTMLImageElement;
    expect(img.src).toContain('/bulbasaur-mega.png');

    fireEvent.error(img);
    expect(img.src).toContain('/bulbasaur.png');
    expect(img.src).not.toContain('-mega');
  });

  it('defaults a dual-form Mega pick (Charizard) to the X variant', () => {
    const onChange = vi.fn();
    render(<PokemonPicker value={null} onChange={onChange} />);
    openPicker();
    fireEvent.click(screen.getByRole('checkbox', { name: 'megaToggleLabel' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'dracaufeu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dracaufeu' }));
    // 20006 = encodeMegaDex(6, 'x') — Charizard is dex 6.
    expect(onChange).toHaveBeenCalledWith(20006);
  });

  it('resets the Mega toggle after a pick, and does not encode a plain pick', () => {
    const onChange = vi.fn();
    render(<PokemonPicker value={null} onChange={onChange} />);
    openPicker();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'dracaufeu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dracaufeu' }));
    expect(onChange).toHaveBeenCalledWith(6);

    openPicker();
    expect(screen.getByRole('checkbox', { name: 'megaToggleLabel' })).not.toBeChecked();
  });

  it('renders the Mega sprite on the trigger circle for a Mega-encoded value', () => {
    render(<PokemonPicker value={10658} onChange={() => {}} />);
    const trigger = screen.getByRole('button', { name: 'profileSpriteLabel' });
    const img = trigger.querySelector('img');
    expect(img?.src).toContain('/greninja-mega.png');
  });

  it('does not steal focus onto the search field when opened — avoids popping the mobile keyboard', () => {
    render(<PokemonPicker value={null} onChange={() => {}} />);
    openPicker();
    expect(screen.getByRole('textbox')).not.toHaveFocus();
  });

  it('offers a "clear" tile first in the grid, to remove a sprite rather than only replace it', () => {
    const onChange = vi.fn();
    render(<PokemonPicker value={6} onChange={onChange} />);
    openPicker();
    fireEvent.click(screen.getByRole('button', { name: 'clearSpriteLabel' }));
    expect(onChange).toHaveBeenCalledWith(null);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('ignores the Mega toggle when clearing', () => {
    const onChange = vi.fn();
    render(<PokemonPicker value={6} onChange={onChange} />);
    openPicker();
    fireEvent.click(screen.getByRole('checkbox', { name: 'megaToggleLabel' }));
    fireEvent.click(screen.getByRole('button', { name: 'clearSpriteLabel' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
