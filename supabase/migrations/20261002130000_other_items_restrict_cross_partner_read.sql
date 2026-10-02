-- Narrow the pre-existing cross-partner "authenticated users can read vinted
-- queue/post jobs" policies (20260918141259, 20260921081307) so an
-- other_item_id row is only visible to Fred — those policies predate this
-- feature and were never revisited when other_item_id was added. A
-- RESTRICTIVE policy is ANDed against the existing PERMISSIVE ones, so
-- card/lot cross-partner visibility is completely unaffected; only rows
-- with other_item_id set are narrowed.

create policy "other_item rows in vinted_queue are fred only"
  on vinted_queue as restrictive for select to authenticated
  using (other_item_id is null or auth.uid() = '35385d3c-5966-4a10-8568-8d92d1be47e7');

create policy "other_item rows in vinted_post_jobs are fred only"
  on vinted_post_jobs as restrictive for select to authenticated
  using (other_item_id is null or auth.uid() = '35385d3c-5966-4a10-8568-8d92d1be47e7');
