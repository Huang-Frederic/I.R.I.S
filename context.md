# PokeManager — Spécification complète pour Claude Code

> **Instructions :** Ce document est la spec complète de l'application PokeManager. Lis-le entièrement avant de commencer. Tu peux démarrer la construction dès la lecture terminée — tout est défini ici, aucune clarification nécessaire.

---

## 1. Vision & Contexte

PokeManager est une **Progressive Web App (PWA)** de gestion de collection de cartes Pokémon TCG. L'utilisateur possède :
- Un grand stock de cartes rares (AR, SAR, SR, RR, etc.) en plusieurs langues (JP, EN, FR, etc.) à vendre sur Vinted
- Un classeur "Pokédex" avec **une seule carte par Pokémon** (les meilleures)

L'app doit permettre :
1. **Scanner** des cartes via photo (OCR + enrichissement API) — depuis le mobile, un script Python local, ou en lot
2. **Gérer le Pokédex** — grille de 1025 Pokémon, silhouette si manquant, sprite coloré si carte enregistrée
3. **Gérer le stock Vinted** — liste FIFO, générateur d'annonce, prix Cardmarket live
4. **Dashboard** — valeur du stock, KPIs, cartes les plus rares, alertes

L'app est installable sur Android via raccourci homescreen (PWA). Elle est hébergée sur **Vercel**. Les données sont dans **Supabase** (PostgreSQL + Storage).

---

## 2. Stack Technique

| Couche | Technologie | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router) | TypeScript strict |
| Styling | Tailwind CSS v4 | Dark mode `data-theme` |
| PWA | next-pwa | manifest.json + Service Worker |
| Base de données | Supabase (PostgreSQL) | Row Level Security activé |
| Stockage photos | Supabase Storage | Bucket `card-photos` |
| Auth | Supabase Auth | Email/password simple, 1 utilisateur |
| OCR | Google Cloud Vision API | `TEXT_DETECTION` |
| Cartes metadata | Pokémon TCG API | Gratuit, sans clé pour usage basique |
| Sprites Pokédex | PokeAPI | `https://pokeapi.co/api/v2/pokemon/{id}` |
| Prix cartes | Cardmarket API v2.0 (MKM) | Compte PRO disponible — OAuth 1.0a |
| Cron prix | Vercel Cron Jobs | 1×/jour, 2h du matin |
| Icons | Lucide React | |
| Animations | tailwindcss-animate | |
| Déploiement | Vercel | Auto-deploy depuis GitHub |

### Variables d'environnement requises (`.env.local`)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Google Vision API
GOOGLE_VISION_API_KEY=

# Pokémon TCG API (optionnel — augmente le rate limit)
POKEMON_TCG_API_KEY=

# Cardmarket API v2.0 (compte PRO)
MKM_APP_TOKEN=
MKM_APP_SECRET=
MKM_ACCESS_TOKEN=
MKM_ACCESS_SECRET=
MKM_API_URL=https://api.cardmarket.com/ws/v2.0

# App
CRON_SECRET=  # token aléatoire pour sécuriser les cron routes
NEXT_PUBLIC_APP_URL=https://pokemanager.vercel.app
```

---

## 3. Structure du Projet

```
pokemanager/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx              # Layout principal avec sidebar/bottom nav
│   │   ├── page.tsx                # Dashboard /
│   │   ├── submit/page.tsx         # Submission (3 modes)
│   │   ├── pokedex/page.tsx        # Pokédex grille 1025
│   │   └── vinted/page.tsx         # Stock Vinted
│   ├── api/
│   │   ├── ocr/route.ts            # POST: image → texte OCR
│   │   ├── enrich/route.ts         # POST: texte OCR → metadata TCG API
│   │   ├── cards/route.ts          # POST: insérer carte(s) | GET: liste
│   │   ├── cards/[id]/route.ts     # PATCH: modifier status | DELETE
│   │   ├── pokedex/replace/route.ts # POST: remplacer carte Pokédex (atomique)
│   │   ├── prices/update/route.ts  # POST: cron Cardmarket (protégé CRON_SECRET)
│   │   └── vinted/generate/route.ts # POST: générer titre+description Vinted
│   ├── layout.tsx                  # Root layout + PWA meta
│   └── globals.css
├── components/
│   ├── ui/                         # Composants atomiques (Button, Badge, Input...)
│   ├── cards/
│   │   ├── CardDrawer.tsx          # Drawer détail carte
│   │   ├── CardThumbnail.tsx       # Miniature carte avec status badge
│   │   └── ScanSuggestion.tsx      # UI de suggestion Pokédex au scan
│   ├── pokedex/
│   │   ├── PokedexGrid.tsx         # Grille 1025 sprites
│   │   ├── PokedexCell.tsx         # Cellule sprite (shadow/color)
│   │   └── PokedexDrawer.tsx       # Drawer infos carte Pokédex
│   ├── vinted/
│   │   ├── VintedList.tsx          # Liste FIFO cartes à vendre
│   │   ├── VintedRow.tsx           # Ligne avec prix + générateur
│   │   └── AnnonceGenerator.tsx    # Modal génération titre+description
│   ├── submit/
│   │   ├── MobileSubmit.tsx        # Mode 1: upload 1 carte
│   │   ├── BatchSubmit.tsx         # Mode 3: lot ≤20 cartes
│   │   ├── ReviewQueue.tsx         # File de validation post-OCR
│   │   └── ReviewCard.tsx          # Validation individuelle d'une carte
│   ├── dashboard/
│   │   ├── KPIGrid.tsx
│   │   ├── RarestCards.tsx
│   │   └── ActivityFeed.tsx
│   └── layout/
│       ├── Sidebar.tsx             # Nav desktop
│       ├── BottomNav.tsx           # Nav mobile (4 items)
│       └── ThemeToggle.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts               # createBrowserClient()
│   │   └── server.ts               # createServerClient()
│   ├── api/
│   │   ├── vision.ts               # Google Vision wrapper
│   │   ├── tcgapi.ts               # Pokémon TCG API wrapper
│   │   ├── cardmarket.ts           # Cardmarket API v2.0 OAuth 1.0a
│   │   └── pokeapi.ts              # PokeAPI sprites wrapper
│   ├── utils/
│   │   ├── rarity.ts               # Échelle de rareté + comparaison
│   │   ├── vinted-template.ts      # Générateur titre+description Vinted
│   │   └── prices.ts               # Calcul suggested_price
│   └── types/
│       └── index.ts                # Types TypeScript globaux
├── public/
│   ├── manifest.json
│   ├── sw.js                       # Généré par next-pwa
│   └── icons/                      # PWA icons (192x192, 512x512)
├── scripts/
│   └── add_cards.py                # Script Python CLI (voir section 9)
├── next.config.ts
├── tailwind.config.ts
└── middleware.ts                   # Auth guard
```

---

## 4. Base de Données — Schéma SQL Complet

### 4.1 Enums

```sql
CREATE TYPE card_language AS ENUM ('JP', 'EN', 'FR', 'DE', 'IT', 'ES', 'KO', 'PT', 'ZH');
CREATE TYPE card_condition AS ENUM ('NM', 'EX', 'GD', 'PL', 'PO');
CREATE TYPE card_status AS ENUM ('pokedex', 'for_sale', 'collection', 'sold');
CREATE TYPE card_rarity AS ENUM ('SAR', 'AR', 'SR', 'CHR', 'RR', 'R_HOLO', 'R', 'UC', 'C', 'OTHER');
```

### 4.2 Table `rarity_ranks`

```sql
CREATE TABLE rarity_ranks (
  rarity      card_rarity PRIMARY KEY,
  rank        INTEGER NOT NULL,  -- SAR=9, AR=8, SR=7, CHR=6, RR=5, R_HOLO=4, R=3, UC=2, C=1, OTHER=0
  label       TEXT NOT NULL      -- Label d'affichage
);

INSERT INTO rarity_ranks (rarity, rank, label) VALUES
  ('SAR',    9, 'Special Art Rare'),
  ('AR',     8, 'Art Rare'),
  ('SR',     7, 'Super Rare'),
  ('CHR',    6, 'Character Rare'),
  ('RR',     5, 'Double Rare'),
  ('R_HOLO', 4, 'Rare Holo'),
  ('R',      3, 'Rare'),
  ('UC',     2, 'Uncommon'),
  ('C',      1, 'Common'),
  ('OTHER',  0, 'Other');
```

### 4.3 Table `lots`

```sql
CREATE TABLE lots (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  photo_url   TEXT,               -- URL Supabase Storage de la photo du lot physique
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

### 4.4 Table `cards` (table principale)

```sql
CREATE TABLE cards (
  -- Identité
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Pokémon
  pokemon_name     TEXT NOT NULL,
  pokemon_number   INTEGER NOT NULL CHECK (pokemon_number BETWEEN 1 AND 1025),

  -- Carte
  card_name        TEXT NOT NULL,
  card_id_tcg      TEXT,           -- ID Pokémon TCG API (ex: "sv2a-200")
  set_name         TEXT,           -- "Pokémon Card 151"
  set_code         TEXT,           -- "sv2a"
  set_number       TEXT,           -- "200/165"
  language         card_language NOT NULL,
  rarity           card_rarity NOT NULL,
  rarity_rank      INTEGER NOT NULL DEFAULT 0,  -- Copié depuis rarity_ranks.rank
  condition        card_condition NOT NULL DEFAULT 'NM',

  -- Status (source de vérité unique)
  status           card_status NOT NULL DEFAULT 'for_sale',

  -- Images
  image_url        TEXT,           -- Ta photo (Supabase Storage) — chemin: card-photos/{user_id}/{card_id}.jpg
  tcg_image_url    TEXT,           -- Image officielle TCG API

  -- Cardmarket
  cardmarket_id    TEXT,           -- ID produit Cardmarket (mappé une fois, réutilisé)
  cm_price_low     NUMERIC(10,2),
  cm_price_trend   NUMERIC(10,2),
  cm_price_avg     NUMERIC(10,2),
  suggested_price  NUMERIC(10,2),  -- Calculé: cm_price_trend * coeff (configurable)
  cm_updated_at    TIMESTAMPTZ,

  -- Lot
  lot_id           UUID REFERENCES lots(id) ON DELETE SET NULL,

  -- Dates & vente
  date_added       TIMESTAMPTZ DEFAULT now() NOT NULL,
  date_sold        TIMESTAMPTZ,
  sold_price       NUMERIC(10,2),

  -- Misc
  notes            TEXT
);

-- CONTRAINTE CLÉE : un seul Pokémon par entrée Pokédex
CREATE UNIQUE INDEX one_pokedex_per_pokemon
  ON cards (pokemon_number)
  WHERE status = 'pokedex';

-- Index de performance
CREATE INDEX idx_cards_status ON cards (status);
CREATE INDEX idx_cards_pokemon_number ON cards (pokemon_number);
CREATE INDEX idx_cards_date_added ON cards (date_added ASC);
CREATE INDEX idx_cards_card_id_tcg ON cards (card_id_tcg);
CREATE INDEX idx_cards_lot_id ON cards (lot_id);

-- Index full-text pour la recherche
CREATE INDEX idx_cards_search ON cards USING gin(
  to_tsvector('simple',
    coalesce(card_name, '') || ' ' ||
    coalesce(pokemon_name, '') || ' ' ||
    coalesce(set_name, '') || ' ' ||
    coalesce(set_code, '') || ' ' ||
    coalesce(set_number, '')
  )
);
```

### 4.5 Table `config`

```sql
CREATE TABLE config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO config (key, value) VALUES
  ('price_coefficient', '0.85'),    -- suggested_price = cm_price_trend * 0.85
  ('vinted_shipping_note', 'Expédition soignée en toploader + enveloppe rigide. Suivi disponible en option.'),
  ('vinted_seller_note', 'Vendeur sérieux. Questions bienvenues.');
```

### 4.6 Row Level Security

```sql
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
ALTER TABLE rarity_ranks ENABLE ROW LEVEL SECURITY;

-- Seul l'utilisateur authentifié peut tout faire (app mono-utilisateur)
CREATE POLICY "authenticated_all" ON cards FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON lots FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read" ON config FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON rarity_ranks FOR SELECT TO authenticated USING (true);

-- Service role bypass (utilisé par les cron jobs)
```

---

## 5. Modules — Spécification Détaillée

### 5.1 Module Submission (`/submit`)

Page mobile-first avec **3 onglets** :

#### Mode 1 — Mobile rapide (onglet actif par défaut)
- Grand bouton central "📷 Scanner une carte"
- Ouvre `<input type="file" accept="image/*" capture="environment">` — déclenche la caméra sur mobile, ouvre le sélecteur de fichier sur desktop
- Après sélection → appel `POST /api/ocr` → appel `POST /api/enrich` → affichage du formulaire de revue pré-rempli
- Formulaire de revue : pokemon_name, card_name, set_name, set_code, set_number, language, rarity, condition, status
- Indicateur de confiance OCR : si score < 80%, afficher un warning orange "Vérifier les informations"
- En bas du formulaire : **suggestion Pokédex** (voir section 6)
- Bouton "Enregistrer" → `POST /api/cards` → upload photo dans Supabase Storage → redirect vers Vinted ou Pokédex selon le status choisi

#### Mode 2 — Lot (onglet "Lot ≤20")
- Zone de drop / multi-select pour jusqu'à **20 photos individuelles** (une photo = une carte, pour OCR)
- **Zone séparée** : 1 photo du lot physique (facultatif, pour référence — pas d'OCR dessus)
- Bouton "Analyser le lot" → OCR parallèle sur toutes les photos individuelles (Promise.all)
- Affichage d'une **file de revue** : cards traitées une par une avec formulaire pré-rempli + navigation Précédent/Suivant
- Compteur "3/12 cartes validées"
- Bouton "Tout enregistrer" → créer d'abord l'entrée `lots` (avec upload photo lot si fournie), puis bulk insert toutes les cartes avec le `lot_id`

#### Mode 3 — Info Script Python
- Page statique expliquant comment utiliser `add_cards.py`
- Affiche les instructions et le token API à utiliser

---

### 5.2 Module Pokédex (`/pokedex`)

#### Affichage grille
- Grille CSS responsive : `grid-template-columns: repeat(auto-fill, minmax(80px, 1fr))`
- 1025 cellules. Chaque cellule affiche :
  - **Si `status = 'pokedex'` existe pour ce `pokemon_number`** : sprite officiel PokeAPI en couleur + numéro + nom
  - **Sinon** : sprite PokeAPI avec `filter: brightness(0) opacity(0.25) saturate(0)` (silhouette sombre) + numéro + "???"
- Les sprites viennent de : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{pokemon_number}.png` (plus fiable que l'API PokeAPI directe)
- Lazy loading des images (`loading="lazy"`)

#### Filtres
- Barre de filtres sticky en haut : Génération (menu déroulant : Tous / Gen 1→9), Statut (Tous / Complétés / Manquants), search par nom/numéro
- Les 9 générations avec leurs plages de numéros : Gen1 1-151, Gen2 152-251, Gen3 252-386, Gen4 387-493, Gen5 494-649, Gen6 650-721, Gen7 722-809, Gen8 810-905, Gen9 906-1025

#### Drawer (clic sur une cellule)
- Sheet/Drawer latéral (desktop: droite, mobile: bottom sheet)
- **Si carte possédée** :
  - Ta photo (Supabase Storage) côté gauche
  - Image officielle TCG API côté droit
  - Nom complet de la carte, set, numéro dans le set, rareté, langue, condition
  - Date d'ajout
  - Prix Cardmarket : low / trend / avg / suggested
  - Badge rarity : SAR en rouge, AR en orange, etc.
  - Bouton "Remplacer" → si des cartes avec ce `pokemon_number` existent avec `status = 'for_sale'` ou `status = 'collection'`, proposer une liste pour les sélectionner comme remplacement
- **Si manquant** :
  - Sprite en silhouette large
  - Message "Aucune carte pour [Pokémon]"
  - Bouton "Scanner une carte" → redirect vers /submit

---

### 5.3 Module Vinted (`/vinted`)

#### Liste principale
- Requête : `SELECT * FROM cards WHERE status = 'for_sale' ORDER BY date_added ASC`
- **Tri : FIFO strict — les premières cartes ajoutées sont en tête de liste**. Pas de tri configurable côté utilisateur — c'est intentionnel pour maintenir l'ordre de traitement.
- Chaque ligne affiche :
  - Numéro de position (#1, #2, #3...)
  - Miniature de ta photo (Supabase Storage) ou image TCG en fallback
  - Nom de la carte, set, numéro dans le set, langue, rareté, condition
  - Badge "Registered ✓" (doré) si une carte `status = 'pokedex'` existe pour ce `pokemon_number`, sinon "Not Registered" (vert)
  - Le badge "Registered" est **cliquable** → ouvre le drawer Pokédex pour ce Pokémon
  - Prix suggéré (en gras, couleur dorée)
  - Bouton "Annonce" → ouvre le modal générateur
  - Bouton "Vendu" → voir ci-dessous

#### Groupement des doublons
- Les cartes identiques (`card_id_tcg` + `language` + `condition` identiques) sont **affichées groupées** avec un badge "×N"
- Côté front uniquement — la DB stocke chaque carte individuellement
- L'affichage groupé montre le suggested_price de la première carte du groupe
- "Vendu" sur un groupe prend la première carte du groupe (ORDER BY date_added ASC) et passe son status à `sold`

#### Barre de recherche
- Champ de recherche unique, debounce 300ms
- Recherche simultanée sur (ilike, insensible à la casse) :
  - `set_number` (ex: "200/165")
  - `card_name` (ex: "Dracaufeu ex")
  - `pokemon_name` (ex: "Pikachu")
  - `set_name` (ex: "151", "Paradox Rift")
  - `set_code` (ex: "sv2a")
  - `language` (ex: "JP")
  - `rarity` (ex: "SAR", "AR")
- Filtres additionnels (chips cliquables, cumulables) : Langue, Rareté, Registered/Not Registered

#### Action "Vendu"
1. Passer le status de la carte à `sold`
2. Renseigner `date_sold = now()`
3. Afficher un modal "Prix de vente ?" (optionnel, peut être ignoré)
4. Vérifier : si le Pokémon a une carte `status = 'pokedex'` AND il n'existe plus aucune autre carte `for_sale` pour ce `pokemon_number` → **alerte restock** : toast + entrée dans le feed du dashboard

#### Générateur d'annonce (modal)
- S'ouvre au clic sur "Annonce"
- Génère automatiquement via `POST /api/vinted/generate` :

**Titre (max 80 chars pour Vinted) :**
```
{card_name} — {set_name} — {rarity} — {language} — {condition}
```
Exemple : `Dracaufeu ex — 151 — SAR — JP — NM`

**Description :**
```
✨ {card_name} — {rarity_label}
📦 Set : {set_name} ({set_code})
{language_flag} Langue : {language_full_name}
⭐ État : {condition_full_name}
🔢 N° : {set_number}

{vinted_shipping_note}  ← depuis config table
{vinted_seller_note}    ← depuis config table
```

- Boutons "Copier le titre" et "Copier la description" (clipboard API)
- Affichage du prix Cardmarket : Low / Trend / Avg / **Suggéré**
- Affichage de ta photo + image TCG côte à côte pour référence visuelle lors de la mise en ligne

---

### 5.4 Dashboard (`/`)

#### KPIs (4 cards en grille)
| KPI | Requête |
|---|---|
| Valeur stock Vinted | `SUM(cm_price_trend) WHERE status='for_sale'` |
| Valeur Pokédex | `SUM(cm_price_trend) WHERE status='pokedex'` |
| Pokédex complété | `COUNT(*) WHERE status='pokedex'` / 1025 |
| Ventes ce mois | `SUM(sold_price) WHERE status='sold' AND date_sold >= début du mois` |

#### Cartes les plus rares du Pokédex
- `SELECT * FROM cards WHERE status='pokedex' ORDER BY rarity_rank DESC, cm_price_trend DESC LIMIT 10`
- Affichées en liste avec badge rareté coloré, nom, set, langue, prix trend

#### Alertes actives
- Cartes vendues dont le Pokémon est "Registered" et dont le stock `for_sale` est à 0
- Stockées en mémoire (pas de table séparée) : calculées à la volée à chaque chargement du dashboard
- Requête : Pokémon avec `status='pokedex'` mais 0 carte `for_sale`

#### Activité récente
- 10 dernières actions : ajouts (date_added DESC), ventes (date_sold DESC)
- Variations de prix significatives (cm_price_trend delta > 10% depuis le dernier update)

---

## 6. Logique de Suggestion Pokédex au Scan

À la fin de chaque scan (après OCR + enrichissement TCG), avant l'enregistrement, l'app exécute cette logique :

```typescript
// lib/utils/pokedex-suggestion.ts

interface SuggestionResult {
  type: 'no_entry' | 'can_replace' | 'keep_existing' | 'no_pokemon_number';
  existingCard?: Card;
  message: string;
  primaryAction: 'add_to_pokedex' | 'add_to_vinted' | 'add_to_collection';
  secondaryActions: ('add_to_pokedex' | 'add_to_vinted' | 'add_to_collection')[];
}

async function computePokedexSuggestion(
  newCard: Partial<Card>,
  supabase: SupabaseClient
): Promise<SuggestionResult> {
  if (!newCard.pokemon_number) {
    return { type: 'no_pokemon_number', ... };
  }

  // Chercher la carte actuelle dans le Pokédex pour ce Pokémon
  const { data: existingPokedexCard } = await supabase
    .from('cards')
    .select('*')
    .eq('pokemon_number', newCard.pokemon_number)
    .eq('status', 'pokedex')
    .maybeSingle();

  if (!existingPokedexCard) {
    // Pokémon manquant dans le Pokédex
    return {
      type: 'no_entry',
      message: `Aucune carte pour ${newCard.pokemon_name} dans ton Pokédex`,
      primaryAction: 'add_to_pokedex',
      secondaryActions: ['add_to_vinted', 'add_to_collection']
    };
  }

  const newRank = newCard.rarity_rank ?? 0;
  const existingRank = existingPokedexCard.rarity_rank;

  if (newRank > existingRank) {
    // Nouvelle carte meilleure → suggérer de remplacer
    return {
      type: 'can_replace',
      existingCard: existingPokedexCard,
      message: `Cette carte (${newCard.rarity} ${newCard.language}) est plus rare que celle dans ton classeur (${existingPokedexCard.rarity} ${existingPokedexCard.language})`,
      primaryAction: 'add_to_pokedex',  // = remplacer
      secondaryActions: ['add_to_vinted', 'add_to_collection']
    };
  }

  if (newRank === existingRank) {
    // Même rareté → tie-breaker par cm_price_trend si disponible
    const newPrice = newCard.cm_price_trend ?? 0;
    const existingPrice = existingPokedexCard.cm_price_trend ?? 0;
    if (newPrice > existingPrice * 1.1) {  // 10% plus cher = meilleur
      return { type: 'can_replace', existingCard: existingPokedexCard, ... };
    }
  }

  // Nouvelle carte moins bonne
  return {
    type: 'keep_existing',
    existingCard: existingPokedexCard,
    message: `Tu as déjà un ${existingPokedexCard.rarity} ${existingPokedexCard.language} de ${newCard.pokemon_name} dans ton classeur`,
    primaryAction: 'add_to_vinted',
    secondaryActions: ['add_to_collection', 'add_to_pokedex']  // override possible
  };
}
```

**Remplacement atomique Pokédex** (`POST /api/pokedex/replace`) :
```typescript
// Transaction: l'ancienne carte change de status, la nouvelle devient pokedex
await supabase.rpc('replace_pokedex_card', {
  old_card_id: existingCard.id,
  old_new_status: 'for_sale',  // ou 'collection', choix utilisateur
  new_card_id: newCard.id
});
```

Fonction SQL correspondante :
```sql
CREATE OR REPLACE FUNCTION replace_pokedex_card(
  old_card_id UUID,
  old_new_status card_status,
  new_card_id UUID
) RETURNS void AS $$
BEGIN
  UPDATE cards SET status = old_new_status WHERE id = old_card_id;
  UPDATE cards SET status = 'pokedex' WHERE id = new_card_id;
END;
$$ LANGUAGE plpgsql;
```

---

## 7. Intégrations API

### 7.1 OCR — Google Cloud Vision (`/api/ocr`)

```typescript
// POST body: FormData avec champ "image" (File)
// Retourne: { text: string, confidence: number, words: string[] }

const response = await fetch(
  `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`,
  {
    method: 'POST',
    body: JSON.stringify({
      requests: [{
        image: { content: base64Image },
        features: [{ type: 'TEXT_DETECTION', maxResults: 1 }]
      }]
    })
  }
);
// Extraire fullTextAnnotation.text et confidence
```

### 7.2 Pokémon TCG API (`/api/enrich`)

```typescript
// POST body: { text: string } — texte OCR brut
// Retourne: { cards: TCGCard[], bestMatch: TCGCard | null }

// Stratégie de recherche :
// 1. Extraire numéro de carte via regex (ex: "200/165")
// 2. Extraire nom du Pokémon
// 3. Rechercher: https://api.pokemontcg.io/v2/cards?q=number:200 nationalPokedexNumbers:6
// 4. Si plusieurs résultats, prendre le plus récent ou celui dont le nom matche le mieux

const response = await fetch(
  `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(query)}&pageSize=10`,
  { headers: { 'X-Api-Key': process.env.POKEMON_TCG_API_KEY ?? '' } }
);

// TCGCard contient: id, name, number, set.name, set.id, rarity, images.small/large,
// nationalPokedexNumbers[], subtypes[]
```

**Mapping rareté TCG API → card_rarity enum** :
```typescript
const rarityMap: Record<string, card_rarity> = {
  'Special Illustration Rare': 'SAR',
  'Illustration Rare': 'AR',
  'Ultra Rare': 'SR',
  'Double Rare': 'RR',
  'Rare Holo': 'R_HOLO',
  'Rare': 'R',
  'Uncommon': 'UC',
  'Common': 'C',
  // Ajouter les raretés JP si nécessaire
};
```

### 7.3 Cardmarket API v2.0 (`lib/api/cardmarket.ts`)

Le compte est de type **PRO** — accès complet à l'API MKM.

**Authentification OAuth 1.0a** (toutes les requêtes) :
```typescript
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

const oauth = new OAuth({
  consumer: {
    key: process.env.MKM_APP_TOKEN!,
    secret: process.env.MKM_APP_SECRET!,
  },
  signature_method: 'HMAC-SHA1',
  hash_function(base_string, key) {
    return crypto.createHmac('sha1', key).update(base_string).digest('base64');
  },
});

function getMKMHeaders(url: string, method: string = 'GET') {
  const requestData = { url, method };
  const token = {
    key: process.env.MKM_ACCESS_TOKEN!,
    secret: process.env.MKM_ACCESS_SECRET!,
  };
  return oauth.toHeader(oauth.authorize(requestData, token));
}
```

**Trouver le product ID Cardmarket depuis une carte TCG :**
```typescript
// Recherche par nom + set
async function findCardmarketProduct(cardName: string, setName: string): Promise<string | null> {
  const url = `${process.env.MKM_API_URL}/products/find?search=${encodeURIComponent(cardName)}&exact=false&idGame=3&idLanguage=1`;
  const headers = getMKMHeaders(url);
  const res = await fetch(url, { headers: { ...headers, 'Content-Type': 'application/json' } });
  const data = await res.json();
  // Filtrer par set si possible, retourner idProduct du meilleur match
  return data.product?.[0]?.idProduct?.toString() ?? null;
}
```

**Récupérer les prix d'un produit :**
```typescript
async function getCardPrices(cardmarketId: string) {
  const url = `${process.env.MKM_API_URL}/products/${cardmarketId}`;
  const headers = getMKMHeaders(url);
  const res = await fetch(url, { headers });
  const data = await res.json();
  const guide = data.product?.priceGuide;
  return {
    cm_price_low:   guide?.LOW ?? null,
    cm_price_trend: guide?.TREND ?? null,
    cm_price_avg:   guide?.AVG ?? null,
  };
}
```

**Cron job de mise à jour des prix** (`/api/prices/update`) :
```typescript
// Protégé par: Authorization: Bearer ${CRON_SECRET}
// Déclenché par Vercel Cron à 2h du matin

// 1. Récupérer toutes les cartes avec cardmarket_id non null et status != 'sold'
// 2. Pour chaque carte (par batch de 10 pour éviter rate limiting) :
//    a. getCardPrices(cardmarket_id)
//    b. Calculer suggested_price = cm_price_trend * config.price_coefficient
//    c. UPDATE cards SET cm_price_low, cm_price_trend, cm_price_avg, suggested_price, cm_updated_at
// 3. Pour les cartes sans cardmarket_id: tenter findCardmarketProduct + update cardmarket_id

// vercel.json cron:
// { "crons": [{ "path": "/api/prices/update", "schedule": "0 2 * * *" }] }
```

### 7.4 PokeAPI — Sprites

Les sprites sont chargés directement via URL statique, pas d'appel API :
```
https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{pokemon_number}.png
```

Pour les sprites "shiny" ou "home" si besoin :
```
https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/{pokemon_number}.png
```

---

## 8. PWA — Configuration

### `public/manifest.json`
```json
{
  "name": "PokeManager",
  "short_name": "PokeManager",
  "description": "Gestion de collection Pokémon TCG",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#111110",
  "theme_color": "#e05252",
  "orientation": "portrait-primary",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### Navigation mobile (bottom nav)
4 onglets : **Home** (dashboard) | **Scanner** | **Pokédex** | **Vinted**
- Icônes Lucide : `LayoutDashboard`, `ScanLine`, `BookOpen`, `Tag`
- Active state : couleur red `#e05252`
- Sur desktop : sidebar gauche 220px fixe

---

## 9. Script Python CLI (`scripts/add_cards.py`)

Script à faire tourner localement pour importer un dossier de photos en masse.

```python
#!/usr/bin/env python3
"""
add_cards.py — PokeManager batch import

Usage:
  python add_cards.py ./photos/              # Importe toutes les images du dossier
  python add_cards.py ./photos/ --dry-run    # Affiche sans insérer
  python add_cards.py ./photos/ --status for_sale  # Force le status (défaut: for_sale)

Requiert: pip install requests tabulate Pillow
Config: créer un fichier .env dans le même dossier ou exporter les vars:
  POKEMANAGER_API_URL=https://pokemanager.vercel.app
  POKEMANAGER_API_TOKEN=<Supabase anon key ou token custom>
"""

import os, sys, json, base64, argparse
from pathlib import Path
from tabulate import tabulate

# 1. Lire le dossier, filtrer .jpg/.png/.webp
# 2. Pour chaque image:
#    a. POST /api/ocr avec l'image en base64
#    b. POST /api/enrich avec le texte OCR
#    c. Afficher les résultats dans le terminal (tabulate)
#    d. Demander confirmation pour chaque carte (y/n/e pour éditer)
#    e. Si 'e': ouvrir un mini-formulaire interactif pour corriger
# 3. À la fin: POST /api/cards avec toutes les cartes validées (bulk)
# 4. Afficher le résumé: X cartes insérées, Y ignorées
```

Le script doit être **entièrement implémenté** (pas de pseudo-code). Utiliser `argparse`, `requests`, et `tabulate`. La confirmation carte par carte peut utiliser `input()`. En mode batch silencieux, ajouter une option `--auto-accept` pour importer tout sans confirmation (à utiliser avec prudence).

---

## 10. Design System

### Couleurs (dark mode par défaut, toggle disponible)

```css
/* Dark mode (défaut) */
--bg: #111110;
--surface: #161614;
--surface-2: #1c1b19;
--surface-off: #222120;
--border: #333230;
--text: #e8e6e3;
--text-muted: #8a8885;
--text-faint: #55524f;

/* Accent principal — Pokéball Red */
--red: #e05252;
--red-bg: #3a2020;

/* Raretés */
--sar-color: #e05252;   /* SAR — rouge */
--ar-color: #e8942a;    /* AR — orange */
--sr-color: #e8af34;    /* SR — doré */
--chr-color: #a86fdf;   /* CHR — violet */
--rr-color: #5591c7;    /* RR — bleu */
--r-holo-color: #4f98a3; /* R Holo — teal */
--r-color: #6daa45;     /* R — vert */
--uc-color: #8a8885;    /* UC — gris */
--c-color: #55524f;     /* C — gris foncé */
```

### Typographie
- Font : Geist (Vercel) via `next/font/google` ou CDN
- Mono : Geist Mono pour les prix, numéros de set, codes
- Dark mode par défaut via `data-theme="dark"` sur `<html>`

### Comportement responsive
- **Mobile (< 768px)** : bottom nav, colonnes empilées, pas de sidebar
- **Desktop (≥ 1024px)** : sidebar fixe gauche 220px, contenu centré max-width 1200px

---

## 11. Règles Métier Importantes

1. **Status exclusif** : une carte ne peut PAS avoir `status = 'pokedex'` ET être dans la liste Vinted. L'index unique partiel en DB le garantit au niveau PostgreSQL.

2. **Tri Vinted** : toujours `ORDER BY date_added ASC`. Ne pas ajouter de tri dynamique côté utilisateur — c'est intentionnel.

3. **Groupement doublons** : côté front uniquement. Deux cartes sont "doublons" si elles partagent `card_id_tcg` + `language` + `condition`. La DB ne groupe jamais.

4. **Remplacement Pokédex** : toujours via la fonction SQL `replace_pokedex_card` pour garantir l'atomicité. Ne jamais faire deux UPDATE séparés.

5. **Prix suggéré** : `suggested_price = cm_price_trend * coeff` où `coeff` vient de `config` table (clé `price_coefficient`, valeur par défaut `0.85`). Le recalcul se fait à chaque update Cardmarket.

6. **Photo Supabase Storage** : chemin = `card-photos/{card_id}.jpg`. Toujours convertir en JPEG avant upload (qualité 85%) pour uniformiser. Générer une miniature 200×280px en WebP stockée à `card-photos/{card_id}-thumb.webp`.

7. **Alerte restock** : déclenchée quand `status` passe à `sold` ET qu'il n'existe plus aucune carte `status = 'for_sale'` avec ce `pokemon_number` ET qu'il existe une carte `status = 'pokedex'` pour ce `pokemon_number`. L'alerte est un toast + une entrée dans le feed dashboard.

8. **Photo du lot** : stockée dans Supabase Storage à `lot-photos/{lot_id}.jpg`. N'est **jamais** envoyée à l'OCR. C'est uniquement une référence visuelle pour retrouver un lot physique.

---

## 12. Gestion des Erreurs

- **OCR échoue ou confiance < 50%** : afficher formulaire vierge avec message d'erreur, laisser l'utilisateur saisir manuellement
- **TCG API ne trouve pas la carte** : `bestMatch = null`, laisser tous les champs vides à remplir manuellement
- **Cardmarket produit non trouvé** : laisser `cardmarket_id = null`, la carte n'aura pas de prix. Afficher un bouton "Lier manuellement" qui ouvre une recherche Cardmarket dans un modal
- **Upload photo échoue** : la carte est quand même insérée en DB (avec `image_url = null`). L'utilisateur peut réessayer l'upload plus tard via un bouton "Ajouter une photo" dans le drawer

---

## 13. Checklist de Déploiement

- [ ] Supabase : créer projet, exécuter tout le SQL de la section 4
- [ ] Supabase Storage : créer bucket `card-photos` (public read), bucket `lot-photos` (public read)
- [ ] Google Cloud : activer Vision API, créer API key
- [ ] Cardmarket : récupérer les 4 tokens OAuth depuis le compte PRO
- [ ] Vercel : connecter repo GitHub, renseigner toutes les env vars
- [ ] `vercel.json` : configurer le cron `/api/prices/update` à `0 2 * * *`
- [ ] Générer les icônes PWA (192×192 et 512×512) et les placer dans `public/icons/`
- [ ] Tester le manifest.json via Chrome DevTools > Application > Manifest
- [ ] Tester "Ajouter à l'écran d'accueil" sur Android Chrome

---

## 14. À NE PAS FAIRE

- Ne pas utiliser `localStorage` — l'app est en SSR/RSC, utiliser Supabase comme seul state persistant
- Ne pas faire de pagination complexe sur la liste Vinted — infinite scroll ou "charger plus" suffisent
- Ne pas créer de table séparée pour les alertes restock — calculées à la volée
- Ne pas stocker les prix Cardmarket historiques — seulement le dernier update (pas de time series)
- Ne pas implémenter de partage ou multi-utilisateur — app strictement mono-utilisateur
