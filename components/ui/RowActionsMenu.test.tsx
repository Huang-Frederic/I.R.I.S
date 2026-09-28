import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RowActionsMenu from './RowActionsMenu';

const ITEMS = [
  { key: 'a', label: 'Action A', onClick: vi.fn() },
  { key: 'b', label: 'Action B', onClick: vi.fn() },
];

describe('<RowActionsMenu>', () => {
  it('renders nothing when there are no items', () => {
    const { container } = render(<RowActionsMenu items={[]} ariaLabel="Actions" />);
    expect(container.firstChild).toBeNull();
  });

  it('opens the menu on trigger click and renders it through a portal, escaping a clipping ancestor', () => {
    // Regression: the dropdown used to be an absolutely-positioned sibling
    // inside the trigger's own DOM subtree — any ancestor with
    // `overflow: hidden` OR `content-visibility: auto` (which implies paint
    // containment) clipped it to that ancestor's box. A portal into
    // document.body escapes both.
    const { container } = render(
      <div style={{ overflow: 'hidden', height: 10 }}>
        <RowActionsMenu items={ITEMS} ariaLabel="Actions" />
      </div>,
    );
    fireEvent.click(screen.getByLabelText('Actions'));
    const menuItem = screen.getByText('Action A');
    expect(container.contains(menuItem)).toBe(false);
    expect(document.body.contains(menuItem)).toBe(true);
  });

  it('calls the item\'s onClick and closes the menu', () => {
    const onClick = vi.fn();
    render(<RowActionsMenu items={[{ key: 'a', label: 'Delete', onClick, destructive: true }]} ariaLabel="Actions" />);
    fireEvent.click(screen.getByLabelText('Actions'));
    fireEvent.click(screen.getByText('Delete'));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.queryByText('Delete')).toBeNull();
  });

  it('closes when clicking outside the trigger and the menu', () => {
    render(<RowActionsMenu items={ITEMS} ariaLabel="Actions" />);
    fireEvent.click(screen.getByLabelText('Actions'));
    expect(screen.getByText('Action A')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('Action A')).toBeNull();
  });

  it('does not close when clicking inside the portaled menu itself', () => {
    render(<RowActionsMenu items={ITEMS} ariaLabel="Actions" />);
    fireEvent.click(screen.getByLabelText('Actions'));
    fireEvent.mouseDown(screen.getByText('Action A'));
    expect(screen.getByText('Action A')).toBeInTheDocument();
  });

  it('closes on scroll instead of drifting away from a trigger it is no longer anchored to', () => {
    render(<RowActionsMenu items={ITEMS} ariaLabel="Actions" />);
    fireEvent.click(screen.getByLabelText('Actions'));
    expect(screen.getByText('Action A')).toBeInTheDocument();

    fireEvent.scroll(window);
    expect(screen.queryByText('Action A')).toBeNull();
  });

  it('shows the attention indicator dot on the trigger when requested', () => {
    const { container } = render(<RowActionsMenu items={ITEMS} ariaLabel="Actions" indicator />);
    expect(container.querySelector('.bg-orange-500')).toBeInTheDocument();
  });
});
