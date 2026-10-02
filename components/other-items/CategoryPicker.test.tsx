import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CategoryPicker from './CategoryPicker';

vi.mock('@/lib/data/vinted-categories.json', () => ({
  default: [
    { id: 164, path: 'Femmes > Accessoires > Bijoux > Colliers' },
    { id: 2994, path: 'Électronique' },
    { id: 553, path: 'Femmes > Accessoires > Bijoux > Bagues' },
  ],
}));

describe('<CategoryPicker>', () => {
  it('filters the list as the user types', () => {
    render(<CategoryPicker value={null} onChange={() => {}} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'bijoux' } });
    expect(screen.getByText('Femmes > Accessoires > Bijoux > Colliers')).toBeInTheDocument();
    expect(screen.getByText('Femmes > Accessoires > Bijoux > Bagues')).toBeInTheDocument();
    expect(screen.queryByText('Électronique')).toBeNull();
  });

  it('calls onChange with the id and path when a result is picked', () => {
    const onChange = vi.fn();
    render(<CategoryPicker value={null} onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'colliers' } });
    fireEvent.click(screen.getByText('Femmes > Accessoires > Bijoux > Colliers'));
    expect(onChange).toHaveBeenCalledWith({
      id: 164,
      path: 'Femmes > Accessoires > Bijoux > Colliers',
    });
  });

  it('shows the currently selected path when a value is set', () => {
    render(<CategoryPicker value={{ id: 2994, path: 'Électronique' }} onChange={() => {}} />);
    expect(screen.getByDisplayValue('Électronique')).toBeInTheDocument();
  });
});
