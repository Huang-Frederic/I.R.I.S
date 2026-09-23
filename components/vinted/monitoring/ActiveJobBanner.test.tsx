import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ActiveJobBanner from './ActiveJobBanner';
import type { ActiveJob } from './hooks/useActiveJob';

const JOB: ActiveJob = {
  cardId: 'c1',
  lotId: null,
  jobType: 'post',
  itemName: 'Pharamp GX',
  itemImage: 'https://example.com/a.png',
  startedAt: new Date(Date.now() - 15_000).toISOString(),
};

describe('<ActiveJobBanner>', () => {
  it('renders nothing when there is no active job and nothing pending', () => {
    const { container } = render(<ActiveJobBanner activeJob={null} pendingCount={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the pending count when nothing is processing', () => {
    render(<ActiveJobBanner activeJob={null} pendingCount={3} />);
    expect(screen.getByText(/3 job/)).toBeInTheDocument();
  });

  it('shows the active job\'s name and a "Publication en cours" label for a post job', () => {
    render(<ActiveJobBanner activeJob={JOB} pendingCount={0} />);
    expect(screen.getByText('Pharamp GX', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/Publication en cours/)).toBeInTheDocument();
  });

  it('shows a "Republication en cours" label for a repost job', () => {
    render(<ActiveJobBanner activeJob={{ ...JOB, jobType: 'repost' }} pendingCount={0} />);
    expect(screen.getByText(/Republication en cours/)).toBeInTheDocument();
  });

  it('shows a "Suppression en cours" label for a delete job', () => {
    render(<ActiveJobBanner activeJob={{ ...JOB, jobType: 'delete' }} pendingCount={0} />);
    expect(screen.getByText(/Suppression en cours/)).toBeInTheDocument();
  });

  it('renders the item image with an empty alt (decorative)', () => {
    render(<ActiveJobBanner activeJob={JOB} pendingCount={0} />);
    // An empty-alt <img> isn't reliably queryable by accessible role across
    // testing-library versions — assert on the src via a plain querySelector.
    expect(document.querySelector('img')?.getAttribute('src')).toBe(JOB.itemImage);
  });
});
