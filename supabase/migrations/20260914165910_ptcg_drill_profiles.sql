-- ptcg_drill_profiles — user-managed decklists for the Drill prize-check
-- trainer (app/(app)/drill). Each profile pairs a resolved decklist with the
-- subset of cards the user wants to be quizzed on. Personal data, same RLS
-- shape as ptcg_games.

create table ptcg_drill_profiles (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null default auth.uid() references auth.users on delete cascade,
  name        text        not null,
  cards       jsonb       not null,   -- DrillCard[]: [{ id, name, count, category }]
  target_ids  jsonb       not null,   -- string[], subset of cards[].id to quiz on
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_ptcg_drill_profiles_user on ptcg_drill_profiles (user_id, created_at desc);

alter table ptcg_drill_profiles enable row level security;

create policy "own drill profiles select"
  on ptcg_drill_profiles for select to authenticated using (user_id = auth.uid());
create policy "own drill profiles insert"
  on ptcg_drill_profiles for insert to authenticated with check (user_id = auth.uid());
create policy "own drill profiles update"
  on ptcg_drill_profiles for update to authenticated using (user_id = auth.uid());
create policy "own drill profiles delete"
  on ptcg_drill_profiles for delete to authenticated using (user_id = auth.uid());
