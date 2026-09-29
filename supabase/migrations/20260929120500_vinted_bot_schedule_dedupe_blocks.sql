-- The day_of_week -> block migration collapsed 5 identical Mon-Fri rows per
-- time window onto the same (user_id, block) pair — de-dupe down to one row
-- per distinct (user_id, block, starts_at, ends_at) so the editor doesn't
-- show 5 copies of the same créneau.
delete from vinted_bot_schedule a
using vinted_bot_schedule b
where a.user_id = b.user_id
  and a.block = b.block
  and a.starts_at = b.starts_at
  and a.ends_at = b.ends_at
  and a.id > b.id;
