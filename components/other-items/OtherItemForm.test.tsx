import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OtherItemForm from './OtherItemForm';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/lib/data/vinted-categories.json', () => ({
  default: [{ id: 2994, path: 'Électronique > Aspirateurs' }],
}));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText('nameLabel'), {
    target: { value: 'Robot Aspirateur Midea S8+' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'categoryLabel' }), {
    target: { value: 'aspirateurs' },
  });
  fireEvent.click(screen.getByText('Électronique > Aspirateurs'));
  fireEvent.change(screen.getByLabelText('priceLabel'), { target: { value: '90' } });
}

describe('<OtherItemForm>', () => {
  it('blocks submission when the name is over 80 characters', () => {
    render(<OtherItemForm />);
    fireEvent.change(screen.getByLabelText('nameLabel'), { target: { value: 'x'.repeat(81) } });
    expect(screen.getByText('errorNameTooLong')).toBeInTheDocument();
  });

  it('submits the form data to /api/other-items on success', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ item: { id: '1' } }) });
    render(<OtherItemForm />);
    fillRequiredFields();
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('photoInputLabel'), { target: { files: [file] } });
    fireEvent.click(screen.getByText('submit'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/other-items',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('shows an error when no photo was added', () => {
    render(<OtherItemForm />);
    fillRequiredFields();
    fireEvent.click(screen.getByText('submit'));
    expect(screen.getByText('errorPhoto')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
