import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CategorySelect from './CategorySelect';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('<CategorySelect>', () => {
  it("shows the selected category's label", () => {
    render(<CategorySelect value="challenge" onChange={() => {}} />);
    expect(screen.getByText('category_challenge')).toBeInTheDocument();
  });

  it('opens a list of all 7 categories on click', () => {
    render(<CategorySelect value="online" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getAllByRole('option')).toHaveLength(7);
  });

  it('calls onChange and closes the list when an option is picked', () => {
    const onChange = vi.fn();
    render(<CategorySelect value="online" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('option', { name: /category_worlds/ }));

    expect(onChange).toHaveBeenCalledWith('worlds');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes the list on an outside click without changing the value', () => {
    const onChange = vi.fn();
    render(
      <div>
        <CategorySelect value="online" onChange={onChange} />
        <button type="button">outside</button>
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /category_online/ }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText('outside'));

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
