-- Fred's only way to edit an other_item today is the Supabase table editor
-- (no PATCH route exists — a stock/edit UI is explicitly out of scope for
-- this feature). That bypasses the app-level syncOtherItemQueueMembership
-- call entirely, so a status change made there (e.g. Task 10's own
-- documented "set status to for_sale" step) never reaches vinted_queue.
-- This trigger performs the same sync directly in Postgres so it works
-- regardless of how the row gets edited. Fires on UPDATE OF status only —
-- NOT on INSERT, since insertion-time sync is already handled by the
-- existing app-level call in app/api/other-items/route.ts, and firing both
-- would race against vinted_queue's unique(user_id, other_item_id)
-- constraint.

create or replace function sync_other_item_queue_on_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fred_id uuid := '35385d3c-5966-4a10-8568-8d92d1be47e7';
  already_listed boolean;
  next_position integer;
begin
  select exists(
    select 1 from other_item_listings
    where other_item_id = new.id and user_id = fred_id and vinted_listing_id is not null
  ) into already_listed;

  if new.status = 'for_sale' and not already_listed then
    if not exists (select 1 from vinted_queue where user_id = fred_id and other_item_id = new.id) then
      select coalesce(max(position), 0) + 1 into next_position from vinted_queue where user_id = fred_id;
      insert into vinted_queue (user_id, other_item_id, position) values (fred_id, new.id, next_position);
    end if;
  else
    delete from vinted_queue where user_id = fred_id and other_item_id = new.id;
  end if;
  return new;
end;
$$;

create trigger other_items_status_update_queue_sync
  after update of status on other_items
  for each row
  execute function sync_other_item_queue_on_status_change();
