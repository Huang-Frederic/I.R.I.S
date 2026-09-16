import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import DeckSprites from './DeckSprites';

describe('<DeckSprites>', () => {
  it('renders a neutral placeholder for null', () => {
    const { container } = render(<DeckSprites dex={null} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.bg-surface-2')).toBeInTheDocument();
  });

  it('renders a neutral placeholder for an empty array', () => {
    const { container } = render(<DeckSprites dex={[]} />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders one sprite image per dex number', () => {
    const { container } = render(<DeckSprites dex={[157, 156]} />);
    expect(container.querySelectorAll('img')).toHaveLength(2);
  });
});
