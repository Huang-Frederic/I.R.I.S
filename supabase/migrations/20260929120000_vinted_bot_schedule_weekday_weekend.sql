-- Replace vinted_bot_schedule's per-day (day_of_week 0-6) model with a
-- 2-bucket "weekday" / "weekend" model — the UI now edits one set of
-- créneaux for the whole working week and one for the weekend, instead of
-- seven individually configurable days.
--
-- Data migration: Saturday (day_of_week=6) previously just duplicated the
-- weekday pattern, so it's dropped rather than merged — the weekend bucket
-- adopts Sunday's distinct pattern (09:00-13:00 / 15:00-18:00) as the
-- canonical Sat+Sun schedule, per Fred's explicit choice.

alter table vinted_bot_schedule add column block text;

delete from vinted_bot_schedule where day_of_week = 6;

update vinted_bot_schedule set block = 'weekend' where day_of_week = 0;
update vinted_bot_schedule set block = 'weekday' where day_of_week in (1, 2, 3, 4, 5);

alter table vinted_bot_schedule alter column block set not null;
alter table vinted_bot_schedule add constraint vinted_bot_schedule_block_check check (block in ('weekday', 'weekend'));

drop index if exists idx_vinted_bot_schedule_user_day;
alter table vinted_bot_schedule drop column day_of_week;

create index idx_vinted_bot_schedule_user_block on vinted_bot_schedule (user_id, block);
