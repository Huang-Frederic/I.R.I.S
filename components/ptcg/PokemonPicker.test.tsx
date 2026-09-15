import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PokemonPicker from './PokemonPicker';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('<PokemonPicker>', () => {
  it('shows no results before a query is typed', () => {
    render(<PokemonPicker value={null} onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: /Dracaufeu/i })).toBeNull();
  });

  it('shows matching results for a French name query', () => {
    render(<PokemonPicker value={null} onChange={() => {}} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'dracaufeu' } });
    expect(screen.getByRole('button', { name: /Dracaufeu/i })).toBeInTheDocument();
  });

  it('shows matching results for an English name query', () => {
    render(<PokemonPicker value={null} onChange={() => {}} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'charizard' } });
    expect(screen.getByRole('button', { name: /Charizard/i })).toBeInTheDocument();
  });

  it('calls onChange with the picked national dex number and clears the query', () => {
    const onChange = vi.fn();
    render(<PokemonPicker value={null} onChange={onChange} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'dracaufeu' } });
    fireEvent.mouseDown(screen.getByRole('button', { name: /Dracaufeu/i }));
    expect(onChange).toHaveBeenCalledWith(6);
    expect(input.value).toBe('');
  });

  it('renders a sprite preview once a value is set', () => {
    render(<PokemonPicker value={6} onChange={() => {}} />);
    const img = screen.getByAltText('') as HTMLImageElement;
    expect(img.src).toContain('/6.png');
  });
});
