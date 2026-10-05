import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OtherItemForm from './OtherItemForm';
import { resizeImage } from '@/lib/utils/resize-image';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/lib/data/vinted-categories.json', () => ({
  default: [{ id: 2994, path: 'Électronique > Aspirateurs' }],
}));
// The real resizeImage() drives an actual browser Image element to measure
// and redraw the photo, which this project's happy-dom test environment
// never resolves (Image never fires onload/onerror here) — awaiting it for
// real would hang any test that submits a photo. Stub it to resolve
// promptly by default; the "waits for an in-flight resize" test below
// overrides this per-call with a manually-controlled promise to prove the
// submit-time wait actually happens.
vi.mock('@/lib/utils/resize-image', () => ({ resizeImage: vi.fn() }));
// The category's Vinted attributes come from a cache the bot fills — each
// test sets what the hook currently reports (idle by default: nothing known,
// nothing blocked).
const attributesHook = vi.hoisted(() => ({
  state: { status: 'idle' } as Record<string, unknown>,
  retry: vi.fn(),
}));
vi.mock('./hooks/useCatalogAttributes', () => ({
  useCatalogAttributes: () => ({ state: attributesHook.state, retry: attributesHook.retry }),
}));

const READY_PUFFER = {
  status: 'ready',
  attributes: {
    catalog_id: 2994,
    status: 'ready',
    size_options: [{ title: 'S/M/L', options: [{ id: 1739, title: 'M' }, { id: 1740, title: 'L' }] }],
    size_required: true,
    condition_options: [{ id: 6, title: 'Neuf avec étiquette' }, { id: 2, title: 'Très bon état' }],
    has_color: true,
    error: null,
  },
};

const fetchMock = vi.fn();
beforeEach(() => {
  attributesHook.state = { status: 'idle' };
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(resizeImage)
    .mockReset()
    .mockResolvedValue(new Blob(['resized-stub'], { type: 'image/jpeg' }));
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

  it('waits for an in-flight resize before submitting, so the raw pre-resize file is never uploaded', async () => {
    // Simulates the realistic "add photo, then immediately hit submit"
    // flow: the user adds a photo last and submits before resizeImage has
    // had a chance to resolve. Holding this promise open lets the test
    // control exactly when the resize "finishes".
    let resolveResize: (blob: Blob) => void = () => {};
    vi.mocked(resizeImage).mockReturnValue(
      new Promise<Blob>((resolve) => {
        resolveResize = resolve;
      }),
    );
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ item: { id: '1' } }) });

    render(<OtherItemForm />);
    fillRequiredFields();
    const file = new File(['raw-bytes'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('photoInputLabel'), { target: { files: [file] } });
    fireEvent.click(screen.getByText('submit'));

    // The resize above is still pending — submission must be held back,
    // not fired off with the raw pre-resize file.
    expect(fetchMock).not.toHaveBeenCalled();

    resolveResize(new Blob(['resized-bytes'], { type: 'image/jpeg' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const body = fetchMock.mock.calls[0][1].body as FormData;
    const uploaded = body.get('photos') as File;
    await expect(uploaded.text()).resolves.toBe('resized-bytes');
  });

  function addPhoto() {
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('photoInputLabel'), { target: { files: [file] } });
  }

  it("sends Vinted's condition id, the picked size (id + label) and colors", async () => {
    attributesHook.state = READY_PUFFER;
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ item: { id: '1' } }) });
    render(<OtherItemForm />);
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText('sizeLabel'), { target: { value: '1740' } });
    fireEvent.click(screen.getByRole('button', { name: 'Noir' }));
    addPhoto();
    fireEvent.click(screen.getByText('submit'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get('vinted_condition_id')).toBe('2'); // "Très bon état" in Vinted's ids
    expect(body.get('vinted_size_id')).toBe('1740');
    expect(body.get('size')).toBe('L');
    expect(body.getAll('vinted_color_ids')).toEqual(['1']);
  });

  it('blocks submission until the size and color the category asks for are chosen', () => {
    attributesHook.state = READY_PUFFER;
    render(<OtherItemForm />);
    fillRequiredFields();
    addPhoto();
    fireEvent.click(screen.getByText('submit'));
    expect(screen.getByText('errorSize')).toBeInTheDocument();
    expect(screen.getByText('errorColor')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still creates the item while the bot hasn't loaded the category — the size can be set later", async () => {
    attributesHook.state = { status: 'waiting_bot' };
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ item: { id: '1' } }) });
    render(<OtherItemForm />);
    fillRequiredFields();
    addPhoto();
    fireEvent.click(screen.getByText('submit'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get('vinted_size_id')).toBeNull();
    expect(body.getAll('vinted_color_ids')).toEqual([]);
  });
});
