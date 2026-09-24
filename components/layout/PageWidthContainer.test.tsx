import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PageWidthContainer from './PageWidthContainer';

const mockUsePathname = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

describe('<PageWidthContainer>', () => {
  it('caps width at 1200px for a regular page', () => {
    mockUsePathname.mockReturnValue('/dashboard');
    render(
      <PageWidthContainer>
        <p>content</p>
      </PageWidthContainer>,
    );
    expect(screen.getByText('content').parentElement!.className).toContain('max-w-[1200px]');
  });

  it('removes the width cap for the Vinted bot page', () => {
    mockUsePathname.mockReturnValue('/vinted/bot');
    render(
      <PageWidthContainer>
        <p>content</p>
      </PageWidthContainer>,
    );
    const className = screen.getByText('content').parentElement!.className;
    expect(className).toContain('max-w-none');
    expect(className).not.toContain('max-w-[1200px]');
  });

  it('also removes the cap for nested routes under the Vinted bot page', () => {
    mockUsePathname.mockReturnValue('/vinted/bot/something');
    render(
      <PageWidthContainer>
        <p>content</p>
      </PageWidthContainer>,
    );
    expect(screen.getByText('content').parentElement!.className).toContain('max-w-none');
  });
});
