import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import OtherItemVintedFields, { type VintedFieldsProps } from './OtherItemVintedFields';
import type { CatalogAttributes } from '@/lib/vinted/other-item-attributes';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

const PUFFER: CatalogAttributes = {
  catalog_id: 2614,
  status: 'ready',
  size_options: [
    { title: 'S/M/L', options: [{ id: 1739, title: 'M' }, { id: 1740, title: 'L' }] },
    { title: 'EU', options: [{ id: 1944, title: 'EU 38' }] },
  ],
  size_required: true,
  condition_options: [
    { id: 6, title: 'Neuf avec étiquette' },
    { id: 2, title: 'Très bon état' },
  ],
  has_color: true,
  error: null,
};

const PERFUME: CatalogAttributes = {
  catalog_id: 145,
  status: 'ready',
  size_options: null,
  size_required: false,
  condition_options: [{ id: 6, title: 'Neuf avec étiquette' }],
  has_color: false,
  error: null,
};

function renderFields(overrides: Partial<VintedFieldsProps> = {}) {
  const props: VintedFieldsProps = {
    attributes: { status: 'ready', attributes: PUFFER },
    onRetry: vi.fn(),
    conditionId: 2,
    sizeId: null,
    colorIds: [],
    onChange: vi.fn(),
    ...overrides,
  };
  render(<OtherItemVintedFields {...props} />);
  return props;
}

describe('<OtherItemVintedFields>', () => {
  it("offers the category's sizes grouped as Vinted groups them, and reports the pick with its label", () => {
    const props = renderFields();
    const select = screen.getByLabelText('sizeLabel');
    expect(screen.getByRole('group', { name: 'S/M/L' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'EU' })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: '1740' } });
    expect(props.onChange).toHaveBeenCalledWith({ sizeId: 1740, sizeLabel: 'L' });
  });

  it("offers only the category's own conditions, labelled in the app's language", () => {
    renderFields();
    const options = screen.getAllByRole('option', { name: /condition/ }).map((o) => o.textContent);
    expect(options).toEqual(['conditionNewWithTag', 'conditionVeryGood']);
  });

  it("uses Vinted's own wording for a condition the app has no label for", () => {
    renderFields({
      attributes: {
        status: 'ready',
        attributes: { ...PERFUME, condition_options: [{ id: 6, title: 'Neuf' }, { id: 7, title: 'Certaines pièces ne fonctionnent pas.' }] },
      },
      conditionId: 7,
    });
    expect(screen.getByRole('option', { name: 'Certaines pièces ne fonctionnent pas.' })).toBeInTheDocument();
  });

  it('hides the size and color pickers where the category has neither', () => {
    renderFields({ attributes: { status: 'ready', attributes: PERFUME }, conditionId: 6 });
    expect(screen.queryByLabelText('sizeLabel')).not.toBeInTheDocument();
    expect(screen.queryByText('colorLabel')).not.toBeInTheDocument();
  });

  it("switches a condition the category doesn't accept to one it does", () => {
    const props = renderFields({ attributes: { status: 'ready', attributes: PERFUME }, conditionId: 2 });
    expect(props.onChange).toHaveBeenCalledWith({ conditionId: 6 });
  });

  it('finds a size Vinted renumbered again by its label, instead of dropping it', () => {
    const renumbered: CatalogAttributes = {
      ...PUFFER,
      size_options: [{ title: 'S/M/L', options: [{ id: 2436, title: 'M' }, { id: 2437, title: 'L' }] }],
    };
    const props = renderFields({ attributes: { status: 'ready', attributes: renumbered }, sizeId: 209, sizeLabel: 'L' });
    expect(props.onChange).toHaveBeenCalledWith({ sizeId: 2437, sizeLabel: 'L' });
  });

  it('drops a size that belongs to another category', () => {
    const props = renderFields({ sizeId: 209 });
    expect(props.onChange).toHaveBeenCalledWith({ sizeId: null, sizeLabel: null });
  });

  it('toggles colors, two at most', () => {
    const props = renderFields({ colorIds: [1] });
    fireEvent.click(screen.getByRole('button', { name: 'Gris' }));
    expect(props.onChange).toHaveBeenLastCalledWith({ colorIds: [1, 3] });
    fireEvent.click(screen.getByRole('button', { name: 'Noir' }));
    expect(props.onChange).toHaveBeenLastCalledWith({ colorIds: [] });
  });

  it('ignores a third color', () => {
    const props = renderFields({ colorIds: [1, 3] });
    fireEvent.click(screen.getByRole('button', { name: 'Blanc' }));
    expect(props.onChange).not.toHaveBeenCalledWith(expect.objectContaining({ colorIds: expect.anything() }));
  });

  it('says when the bot has to run to load the sizes, and still lets colors be picked', () => {
    renderFields({ attributes: { status: 'waiting_bot' } });
    expect(screen.getByText('attributesWaitingBot')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Noir' })).toBeInTheDocument();
  });

  it("shows the bot's error with a retry button", () => {
    const props = renderFields({ attributes: { status: 'error', message: 'HTTP Error 403: ' } });
    fireEvent.click(screen.getByRole('button', { name: 'attributesRetry' }));
    expect(props.onRetry).toHaveBeenCalled();
  });

  it('flags the fields the item still lacks', () => {
    renderFields({ missing: ['size', 'color'] });
    expect(screen.getByText('errorSize')).toBeInTheDocument();
    expect(screen.getByText('errorColor')).toBeInTheDocument();
  });
});
