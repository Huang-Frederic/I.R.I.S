import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Sparkline } from './Sparkline';

describe('<Sparkline>', () => {
  it('renders a polyline with N points', () => {
    const { container } = render(<Sparkline values={[1, 2, 3, 2, 4]} />);
    const poly = container.querySelector('polyline');
    expect(poly).not.toBeNull();
    expect(poly!.getAttribute('points')!.split(' ')).toHaveLength(5);
  });

  it('renders nothing when fewer than 2 points', () => {
    const { container } = render(<Sparkline values={[3]} />);
    expect(container.querySelector('polyline')).toBeNull();
  });

  it('uses green color when last >= first, red otherwise', () => {
    const upRender = render(<Sparkline values={[1, 5]} />);
    expect(upRender.container.querySelector('polyline')!.getAttribute('stroke'))
      .toMatch(/green|22c55e|10b981/);

    const downRender = render(<Sparkline values={[5, 1]} />);
    expect(downRender.container.querySelector('polyline')!.getAttribute('stroke'))
      .toMatch(/red|ef4444|dc2626/);
  });
});
