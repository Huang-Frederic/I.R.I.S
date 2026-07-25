-- ptcg_games — analyse post-partie de Pokémon TCG Live à partir des battle logs
-- exportés depuis le client (écran de fin de match → BATTLE LOG → export).
--
-- Trois tables, trois régimes différents :
--   ptcg_cards    référentiel de JEU (PV, attaques, talents, faiblesses), alimenté
--                 depuis TCGdex. Partagé, écrit en service-role uniquement.
--                 Distinct de tcg_catalog, qui est un catalogue de collection et
--                 ne porte aucune donnée de jeu.
--   ptcg_games    une partie uploadée : le log brut, l'état reconstruit, le
--                 rapport de validation et les détections du moteur de règles.
--   ptcg_analyses les analyses produites pour une partie. Table séparée pour
--                 pouvoir ré-analyser sans ré-uploader, et garder l'historique.
--
-- Les parties sont PERSONNELLES (RLS par auth.uid()), contrairement à cards/lots
-- qui sont partagés entre les deux collectionneurs.

-- ---------------------------------------------------------------------------
-- Référentiel de jeu
-- ---------------------------------------------------------------------------

CREATE TABLE ptcg_cards (
  ptcgl_id     text          NOT NULL,          -- id interne du client, ex. 'sv10_34'
  language     card_language NOT NULL DEFAULT 'FR',  -- le log suit la langue du client
  tcgdex_id    text          NOT NULL,          -- ex. 'sv10-034'
  set_code     text          NOT NULL,          -- 'sv10'  ─┐ jointure vers
  set_number   text          NOT NULL,          -- '034'   ─┘ tcg_catalog
  name         text          NOT NULL,
  category     text          NOT NULL,          -- Pokémon | Dresseur | Énergie
  trainer_type text,                            -- Objet | Supporter | Stade | Outil Pokémon
  stage        text,                            -- Base | Niveau 1 | Niveau 2
  hp           integer,
  types        text[],
  weaknesses   jsonb,                           -- [{ type, value }]
  retreat      integer,
  abilities    jsonb         NOT NULL DEFAULT '[]',  -- [{ name, effect }]
  attacks      jsonb         NOT NULL DEFAULT '[]',  -- [{ name, cost, damage, effect }]
  effect       text,                            -- texte des cartes Dresseur
  image_url    text,
  fetched_at   timestamptz   NOT NULL DEFAULT now(),

  PRIMARY KEY (ptcgl_id, language)
);

-- Jointure vers tcg_catalog pour récupérer image_url et le nom localisé.
CREATE INDEX idx_ptcg_cards_catalog ON ptcg_cards (set_code, set_number, language);

ALTER TABLE ptcg_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read"
  ON ptcg_cards FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- Parties
-- ---------------------------------------------------------------------------

CREATE TABLE ptcg_games (
  id                 uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id            uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  played_at          timestamptz NOT NULL DEFAULT now(),

  me                 text        NOT NULL,      -- pseudo dont la main est visible
  opponent           text        NOT NULL,
  result             text        NOT NULL CHECK (result IN ('win','loss','tie')),
  prizes_me          integer     NOT NULL,      -- récompenses PRISES, pas restantes
  prizes_opponent    integer     NOT NULL,
  turns              integer     NOT NULL,
  my_archetype       text,                      -- déduit, NULL si indéterminé
  opponent_archetype text,

  -- Le log brut est la seule source de vérité : tout le reste peut être
  -- recalculé à partir de lui après un correctif du parser.
  raw_log            text        NOT NULL,
  log_hash           text        NOT NULL,      -- sha256 du log, anti-doublon
  parser_version     text        NOT NULL,      -- pour rejouer après amélioration

  state              jsonb       NOT NULL,      -- état reconstruit tour par tour
  validation         jsonb       NOT NULL,      -- rapport de l'oracle des dégâts

  created_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ptcg_games_unique_log UNIQUE (user_id, log_hash)
);

CREATE INDEX idx_ptcg_games_user_date ON ptcg_games (user_id, played_at DESC);
CREATE INDEX idx_ptcg_games_archetype ON ptcg_games (user_id, my_archetype, opponent_archetype);

ALTER TABLE ptcg_games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own games select"
  ON ptcg_games FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own games insert"
  ON ptcg_games FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own games update"
  ON ptcg_games FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own games delete"
  ON ptcg_games FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Analyses
-- ---------------------------------------------------------------------------

CREATE TABLE ptcg_analyses (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id        uuid        NOT NULL REFERENCES ptcg_games ON DELETE CASCADE,
  schema_version integer     NOT NULL,
  source         text        NOT NULL CHECK (source IN ('rules','llm','manual')),
  model          text,                          -- NULL pour source='rules'
  verdict        jsonb       NOT NULL DEFAULT '{}',
  moments        jsonb       NOT NULL DEFAULT '[]',
  patterns       jsonb       NOT NULL DEFAULT '[]',
  checklist      jsonb       NOT NULL DEFAULT '[]',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ptcg_analyses_game ON ptcg_analyses (game_id, created_at DESC);

-- Agrégation des motifs sur l'historique : « tu oublies un talent dans 7 de tes
-- 12 dernières parties ». C'est ce qui justifie de stocker l'historique, et la
-- raison pour laquelle `patterns` utilise un vocabulaire fermé.
CREATE INDEX idx_ptcg_analyses_patterns ON ptcg_analyses USING gin (patterns);

ALTER TABLE ptcg_analyses ENABLE ROW LEVEL SECURITY;

-- L'analyse hérite de l'accès à sa partie : pas de user_id dupliqué.
CREATE POLICY "own analyses select"
  ON ptcg_analyses FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM ptcg_games g WHERE g.id = game_id AND g.user_id = auth.uid()));
CREATE POLICY "own analyses insert"
  ON ptcg_analyses FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM ptcg_games g WHERE g.id = game_id AND g.user_id = auth.uid()));
CREATE POLICY "own analyses delete"
  ON ptcg_analyses FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM ptcg_games g WHERE g.id = game_id AND g.user_id = auth.uid()));
