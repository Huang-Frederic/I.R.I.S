import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PokemonSpriteBadge from './PokemonSpriteBadge';

describe('PokemonSpriteBadge', () => {
  it('renders the sprite img for a valid pokemon number (Pikachu = 25)', () => {
    render(<PokemonSpriteBadge pokemonNumber={25} />);
    const img = screen.getByRole('img', { name: /sprite pokémon n°25/i });
    expect(img).toBeInTheDocument();
    expect(img.getAttribute('src')).toMatch(/\/25\.png$/);
  });

  it('renders sprite for boundary values 1 and 1025', () => {
    const { rerender } = render(<PokemonSpriteBadge pokemonNumber={1} />);
    expect(screen.getByRole('img', { name: /sprite pokémon n°1/i })).toBeInTheDocument();

    rerender(<PokemonSpriteBadge pokemonNumber={1025} />);
    expect(screen.getByRole('img', { name: /sprite pokémon n°1025/i })).toBeInTheDocument();
  });

  it('renders the Pokeball placeholder when pokemonNumber is null (Trainer/Energy)', () => {
    render(<PokemonSpriteBadge pokemonNumber={null} />);
    expect(screen.getByLabelText(/pas de numéro pokédex/i)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders the invalid placeholder when number is above 1025', () => {
    render(<PokemonSpriteBadge pokemonNumber={9999} />);
    expect(screen.getByLabelText(/numéro pokédex invalide: 9999/i)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders the invalid placeholder when number is below 1', () => {
    render(<PokemonSpriteBadge pokemonNumber={0} />);
    expect(screen.getByLabelText(/numéro pokédex invalide: 0/i)).toBeInTheDocument();
  });

  it('falls back to Pokeball placeholder on image load error', () => {
    render(<PokemonSpriteBadge pokemonNumber={25} />);
    const img = screen.getByRole('img', { name: /sprite/i });
    fireEvent.error(img);
    expect(screen.getByLabelText(/pas de numéro pokédex/i)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('clears the error state when pokemonNumber changes', () => {
    const { rerender } = render(<PokemonSpriteBadge pokemonNumber={25} />);
    fireEvent.error(screen.getByRole('img', { name: /sprite/i }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    rerender(<PokemonSpriteBadge pokemonNumber={150} />);
    expect(screen.getByRole('img', { name: /sprite pokémon n°150/i })).toBeInTheDocument();
  });

  it('applies pixelated image-rendering style to the sprite', () => {
    render(<PokemonSpriteBadge pokemonNumber={25} />);
    const img = screen.getByRole('img', { name: /sprite/i });
    expect(img).toHaveStyle({ imageRendering: 'pixelated' });
  });

  it('appends the className prop to the wrapper', () => {
    render(<PokemonSpriteBadge pokemonNumber={25} className="absolute top-2 right-2" />);
    const img = screen.getByRole('img', { name: /sprite/i });
    const wrapper = img.parentElement;
    expect(wrapper?.className).toMatch(/absolute/);
    expect(wrapper?.className).toMatch(/top-2/);
    expect(wrapper?.className).toMatch(/right-2/);
  });
});
