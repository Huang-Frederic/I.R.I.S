import type { CardStatus } from '@/lib/types';

export interface RepostCandidateInput {
  vintedListingId: string | null;
  vintedPostedAt: string | null;
  status: CardStatus;
}

/** Display-only mirror of the Python agent's repost rule (see
 * vinted-agent/scheduler.py's decide_next_action and the repost query in
 * main.py's _scheduling_loop) — used to render the "pool de reposts"
 * section, never to create a job itself. */
export function isRepostEligible(item: RepostCandidateInput, repostAfterDays: number, now: Date): boolean {
  if (item.status !== 'for_sale') return false;
  if (!item.vintedListingId || !item.vintedPostedAt) return false;
  const ageMs = now.getTime() - new Date(item.vintedPostedAt).getTime();
  return ageMs >= repostAfterDays * 24 * 60 * 60 * 1000;
}
