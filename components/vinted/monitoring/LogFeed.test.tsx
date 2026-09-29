import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LogFeed, { dayLabel } from './LogFeed';
import type { VintedAgentLogRow } from '@/lib/types';

function log(id: string, created_at: string, message = 'test'): VintedAgentLogRow {
  return { id, user_id: 'u1', level: 'info', message, created_at };
}

/** An ISO timestamp `daysAgo` calendar days before today, at a fixed local
 *  hour — anchored to whatever day the test actually runs on (not a
 *  hardcoded date) so these tests don't quietly rot the day after they're
 *  written, and clear of midnight so a reasonable timezone offset can't
 *  shift it onto the wrong calendar day either. */
function isoDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

describe('dayLabel', () => {
  const now = new Date('2026-09-29T12:00:00Z');

  it('labels the current calendar day "Aujourd\'hui"', () => {
    expect(dayLabel('2026-09-29T08:00:00Z', now)).toBe("Aujourd'hui");
  });

  it('labels the previous calendar day "Hier"', () => {
    expect(dayLabel('2026-09-28T10:00:00Z', now)).toBe('Hier');
  });

  it('labels anything older with the plain date', () => {
    expect(dayLabel('2026-09-20T10:00:00Z', now)).toBe('20 septembre');
  });
});

describe('<LogFeed>', () => {
  it('shows a placeholder when there are no logs', () => {
    render(<LogFeed logs={[]} />);
    expect(screen.getByText('Aucun événement récent.')).toBeInTheDocument();
  });

  it('inserts exactly one day divider per distinct day, even with several logs on the same day', () => {
    const logs = [
      log('1', isoDaysAgo(0), 'today B'),
      log('2', isoDaysAgo(0), 'today A'),
      log('3', isoDaysAgo(1), 'yesterday'),
    ];
    render(<LogFeed logs={logs} />);
    expect(screen.getAllByText("Aujourd'hui")).toHaveLength(1);
    expect(screen.getAllByText('Hier')).toHaveLength(1);
  });

  it('renders dividers and messages in the same top-to-bottom order the logs were given in', () => {
    const logs = [
      log('1', isoDaysAgo(0), 'today message'),
      log('2', isoDaysAgo(1), 'yesterday message'),
    ];
    const { container } = render(<LogFeed logs={logs} />);
    const text = container.textContent ?? '';
    expect(text.indexOf("Aujourd'hui")).toBeLessThan(text.indexOf('today message'));
    expect(text.indexOf('today message')).toBeLessThan(text.indexOf('Hier'));
    expect(text.indexOf('Hier')).toBeLessThan(text.indexOf('yesterday message'));
  });

  it('colors an error log message distinctly from an info one', () => {
    const logs = [
      { ...log('1', isoDaysAgo(0), 'bad'), level: 'error' as const },
      { ...log('2', isoDaysAgo(0), 'fine'), level: 'info' as const },
    ];
    render(<LogFeed logs={logs} />);
    expect(screen.getByText('bad').className).toContain('text-red');
    expect(screen.getByText('fine').className).toContain('text-text-muted');
  });
});
