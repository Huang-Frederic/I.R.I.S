-- ptcg_tournaments / ptcg_tournament_rounds — recorded tournament results,
-- independent of whether a PTCG Live battle log exists for any of it. A
-- round's own win/loss/tie is DERIVED (see lib/ptcg/tournaments.ts), never
-- stored, from its games/outcome — correcting one mis-entered game never
-- requires updating a separate "result" column.
--
-- Kept separate from ptcg_games rather than extending it: ptcg_games has
-- several NOT NULL columns (raw_log, state, log_hash, parser_version, turns,
-- prizes_me, prizes_opponent) that only make sense for a parsed battle log.

create table ptcg_tournaments (
  id                uuid        default gen_random_uuid() primary key,
  user_id           uuid        not null default auth.uid() references auth.users on delete cascade,
  name              text        not null,
  -- A plain date (no time-of-day) — recorded after the fact, unlike
  -- ptcg_games.played_at, a timestamp from a log imported minutes after
  -- being played.
  played_at         date        not null,
  category          text        not null check (category in (
                       'online', 'locals', 'challenge', 'cup', 'regionals', 'internationals', 'worlds'
                     )),
  -- Fixed for the whole tournament, not per round — a competitive event's
  -- format sets the best-of, not the player.
  best_of           smallint    not null check (best_of in (1, 3)),
  placement         text        not null default 'no_placement' check (placement in (
                       'no_placement', 'dropped', 'winner', 'top_2', 'top_4', 'top_8', 'top_16',
                       'top_32', 'top_64', 'top_128', 'top_256', 'top_512', 'top_1024'
                     )),
  -- Fixed for the whole tournament too — a player doesn't swap decks
  -- mid-event. Same shape as ptcg_games.my_archetype_dex: an ordered array
  -- of national dex numbers.
  my_archetype_dex  jsonb       not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_ptcg_tournaments_user_date on ptcg_tournaments (user_id, played_at desc);

alter table ptcg_tournaments enable row level security;

create policy "own tournaments select"
  on ptcg_tournaments for select to authenticated using (user_id = auth.uid());
create policy "own tournaments insert"
  on ptcg_tournaments for insert to authenticated with check (user_id = auth.uid());
create policy "own tournaments update"
  on ptcg_tournaments for update to authenticated using (user_id = auth.uid());
create policy "own tournaments delete"
  on ptcg_tournaments for delete to authenticated using (user_id = auth.uid());

create table ptcg_tournament_rounds (
  id                      uuid        default gen_random_uuid() primary key,
  tournament_id           uuid        not null references ptcg_tournaments on delete cascade,
  round_number            smallint    not null,
  opponent_archetype_dex  jsonb       not null default '[]'::jsonb,
  -- Array of up to `best_of` entries: [{ "result": "win"|"loss"|"tie", "wentFirst": true|false|null }, ...].
  -- Empty when `outcome` is set — id/no_show/bye carry no games at all.
  games                   jsonb       not null default '[]'::jsonb,
  -- Intentional Draw / No Show / Bye — each REPLACES `games` entirely rather
  -- than being a fourth game result, since none of them is a played game.
  outcome                 text        check (outcome in ('id', 'no_show', 'bye')),
  created_at              timestamptz not null default now(),

  unique (tournament_id, round_number)
);

create index idx_ptcg_tournament_rounds_tournament on ptcg_tournament_rounds (tournament_id, round_number);

alter table ptcg_tournament_rounds enable row level security;

-- A round inherits access from its tournament — no duplicated user_id.
create policy "own tournament rounds select"
  on ptcg_tournament_rounds for select to authenticated
  using (exists (select 1 from ptcg_tournaments t where t.id = tournament_id and t.user_id = auth.uid()));
create policy "own tournament rounds insert"
  on ptcg_tournament_rounds for insert to authenticated
  with check (exists (select 1 from ptcg_tournaments t where t.id = tournament_id and t.user_id = auth.uid()));
create policy "own tournament rounds update"
  on ptcg_tournament_rounds for update to authenticated
  using (exists (select 1 from ptcg_tournaments t where t.id = tournament_id and t.user_id = auth.uid()));
create policy "own tournament rounds delete"
  on ptcg_tournament_rounds for delete to authenticated
  using (exists (select 1 from ptcg_tournaments t where t.id = tournament_id and t.user_id = auth.uid()));
