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
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bijoux' } });
    expect(screen.getByText('Femmes > Accessoires > Bijoux > Colliers')).toBeInTheDocument();
    expect(screen.getByText('Femmes > Accessoires > Bijoux > Bagues')).toBeInTheDocument();
    expect(screen.queryByText('Électronique')).toBeNull();
  });

  it('calls onChange with the id and path when a result is picked', () => {
    const onChange = vi.fn();
    render(<CategoryPicker value={null} onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'colliers' } });
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

  it('closes the list once a result is picked, and keeps it closed when the field gets focus back', () => {
    render(<CategoryPicker value={null} onChange={() => {}} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'colliers' } });
    fireEvent.click(screen.getByText('Femmes > Accessoires > Bijoux > Colliers'));
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.focus(input);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes the list when the field loses focus (a click elsewhere)', () => {
    render(<CategoryPicker value={null} onChange={() => {}} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'bijoux' } });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.blur(input);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes the list on Escape', () => {
    render(<CategoryPicker value={null} onChange={() => {}} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'bijoux' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('picks with the arrow keys and Enter, without submitting the surrounding form', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <CategoryPicker value={null} onChange={onChange} />
      </form>,
    );
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'bijoux' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith({ id: 553, path: 'Femmes > Accessoires > Bijoux > Bagues' });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
