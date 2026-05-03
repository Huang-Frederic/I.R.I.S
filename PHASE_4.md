Phase 4 :  Passage à 2 users + Import from Vinted profile (once)
-> J'ai un readme aussi 

Brief : Vinted import (one-shot) + passage multi-user

Projet : I.R.I.S, PWA Pokémon TCG décrite dans CLAUDE.md (Next.js 16 / Supabase
/ Tailwind v4, mono-utilisateur aujourd'hui). Phase 3a tout juste finie. Ce
brief couvre 2 features liées qui doivent être livrées ensemble (Feature 2
d'abord parce que Feature 1 dépend de son schéma).

==============================================================================
FEATURE 1 — Bootstrap one-shot des annonces Vinted (UTILISATEUR UNIQUE)
==============================================================================

Objectif : récupérer en une fois TOUTES les annonces actuellement en ligne
sur le compte Vinted de Florent (uniquement) pour seeder le stock IRIS sans
tout re-saisir à la main. Les images notamment ne sont plus en local — la
seule source restante est le CDN Vinted.

IMPORTANT — qui importe :
- SEUL Florent fait tourner ce script. Sa copine n'utilisera JAMAIS le script.
- Workflow validé par l'utilisateur : Florent importe son Vinted → IRIS est
  seedée → la copine NETTOIE son propre compte Vinted (supprime ses
  annonces) → puis re-publie manuellement les cartes en se basant sur l'état
  IRIS, et toggle `VintedListedToggle` au fur et à mesure depuis l'UI (ce qui
  crée ses lignes `card_listings` avec le timestamp courant).
- Donc : pas de logique "matcher si la carte existe déjà", pas de logique
  "deuxième user", pas d'ordre d'import à gérer. Le script est mono-user et
  one-shot, point.

Contexte technique :
- Vinted n'a pas d'API publique mais a une API JSON interne :
  GET https://www.vinted.fr/api/v2/users/{user_id}/items?per_page=200 (paginé).
  Accessible avec le cookie de session (`_vinted_fr_session`), récupéré une
  fois dans DevTools → Application → Cookies.
- Anti-bot DataDome présent mais permissif quand on utilise son propre cookie.
- Le JSON renvoie `photos[]` avec URLs haute résolution sur images*.vinted.net.

Décisions actées :
- Méthode : API interne + cookie de session collé via env var ou prompt.
  Pas de browser automation, pas de scraping HTML.
- Localisation : script Python CLI dans scripts/import_vinted.py, hors app
  prod. S'inscrit dans le pattern Phase 3b (add_cards.py est déjà prévu).
- Images : téléchargées depuis le CDN Vinted, réuploadées dans le bucket
  Supabase Storage `card-photos` existant (public-read, déjà créé), URL
  Supabase écrite dans cards.image_url.

Format des descriptions Vinted (validé par l'utilisateur, exemples réels) :

    ✨ Carte Pokémon Archéodong - VMAX Climax (jpn_s8b-208)
    📘 Version Japonaise 🇯🇵
    ✅ État : Très bon état (Near Mint), carte en excellent état (voir photos).
    [...etc, boilerplate identique pour toutes les annonces]

    ✨ Carte Pokémon Hisuian Voltorbe - VSTAR Universe (jpn_s12a-173)
    ✨ Carte Pokémon Craparoi - Scarlet ex (jpn_sv1s-88)

Le format `(jpn_<set_code>-<set_number>)` contient TOUT ce qu'il faut pour
enrichir via le pipeline existant. Convention : `jpn_` = langue JP, suivi
du code de set TCGdex Japan, suivi du numéro de carte.

Pipeline d'enrichissement (à respecter strictement) :
- L'objectif est de produire des lignes `cards` au MÊME format que celles
  créées par le pipeline OCR existant (cf. CLAUDE.md "Pipeline d'enrichissement"
  + app/api/enrich/route.ts).
- Pour chaque annonce :
    1. Parser la description avec une regex sur `\((jpn|eng|fra|...)_([a-z0-9]+)-(\d+)\)`
       pour extraire language + set_code + set_number. (Florent a 99% de JP
       aujourd'hui mais le parser doit être générique pour les autres langues
       au cas où.)
    2. Réutiliser la même chaîne d'enrichissement que l'OCR : lookup
       `tcg_catalog` (Strategy 1 puis 2), puis fallback TCGdex live (Strategy 3).
       Idéalement, exposer le pipeline existant via une route ou le réimplémenter
       en Python — au choix de l'agent qui implémente, après évaluation.
    3. Mode INTERACTIF : pour chaque carte, le script affiche dans le terminal
       les infos extraites + le résultat enrichi + l'URL de l'image, et
       demande confirmation (y/n/edit). Pas d'auto-import silencieux —
       les faux positifs coûtent cher.
    4. Si confirmé : insert ligne `cards` (status='for_sale', prix repris du
       champ `price` de l'annonce Vinted) + insert ligne `card_listings`
       pour le user_id de Florent, avec listed_at = NOW() (ou idéalement la
       date de création de l'annonce Vinted si présente dans le JSON).
- Si le parser échoue sur une description (format ancien, format custom) :
  prompt manuel pour saisir set_code + set_number à la main, puis pipeline
  standard.

À demander à l'utilisateur avant de coder :
- Lui demander d'extraire son Vinted user_id (visible dans l'URL de son
  profil) pour valider l'endpoint d'import.

==============================================================================
FEATURE 2 — Passage à 2 users (lui + sa copine)
==============================================================================

Modèle métier (à ne PAS réinterpréter — c'est exactement ce que l'utilisateur
a décrit) :
- Pokédex partagé.
- Stock physique partagé : un seul exemplaire physique par carte, mais ils
  cross-listent sur leurs 2 comptes Vinted pour maximiser la visibilité.
- Quand l'un vend, l'autre doit retirer son annonce.
- C'est lui qui scanne et fait l'OCR ; elle copie juste l'image, le titre et
  le prix conseillé sur son propre compte Vinted.
- La SEULE différence entre les deux users dans la base : qui a effectivement
  publié quoi sur son Vinted, ET DEPUIS QUAND. Tout le reste est rigoureusement
  partagé.

Décision de schéma actée :
- Nouvelle table card_listings(card_id uuid, user_id uuid,
  listed_at timestamptz, primary key (card_id, user_id)).
- listed_at est PAR USER : chacun voit sa propre date de mise en ligne, ce
  qui pilote l'indicateur de staleness côté UI ("ta carte est listée depuis
  X jours, refresh recommandé"). Le calcul de staleness existant (helper
  listing-stale.ts) doit être appliqué par-user, pas globalement.
- Migration : créer la table → backfill (chaque ligne cards.vinted_listed_at
  actuelle devient une ligne pour l'user_id de Florent) → drop la colonne
  cards.vinted_listed_at.
- RLS : cards reste partagé en lecture/écriture (status quo).
  card_listings : SELECT pour tous les authentifiés, INSERT/UPDATE/DELETE
  uniquement où user_id = auth.uid().
- Pas de user_id ajouté à la table cards.

Système de flags (UI) :
Chaque ligne dans la liste Vinted affiche jusqu'à 3 flags compacts :
- "Listed by Me" — vert si user courant a une ligne card_listings sur cette
  carte. Affiche aussi le nb de jours depuis listed_at + le badge stale
  si applicable (calculé sur SA propre listed_at).
- "Listed by Partner" — bleu si l'autre user a une ligne card_listings.
  Pas d'info de staleness (c'est pas son problème).
- "To Delete" — rouge, dérivé : apparait si user courant a une ligne
  card_listings ET cards.status != 'for_sale' (sold OU pokedex). Ça veut
  dire la carte n'est plus dispo physiquement mais le user est encore listé
  sur Vinted. Cliquer dessus → confirm modal → supprime la ligne
  card_listings du user courant (équivalent personnel d'un "j'ai retiré mon
  annonce Vinted"). Pas d'effet sur les autres users.

Flow "Vendu" cross-user :
Réutiliser la modal Sold existante ("Mettre un autre exemplaire Stock en vente ?")
SANS créer de nouvelle modal. Modifications minimales :
- Si la carte vendue a une ligne card_listings pour l'autre user, ajouter
  un bandeau ROUGE dans la modal existante :
    "[Nom du partenaire] a aussi cette carte en ligne sur Vinted. Si vous
    ne remettez pas un autre exemplaire en vente, le partenaire devra
    supprimer son annonce."
- Pas de toggle "auto-cleanup la ligne du partenaire". Le partenaire le fait
  lui-même via le flag "To Delete" décrit plus haut. Pas de touche-touche
  silencieux entre comptes.

Toggle existant `VintedListedToggle` :
- Devient per-user (toggle la propre ligne card_listings du user courant).
- Quand on toggle ON : insert card_listings(card_id, auth.uid(), now()).
- Quand on toggle OFF : delete card_listings où user_id = auth.uid().

Filtres Vinted (à mettre à jour) :
Les chips actuelles sont : offline / stale / fresh / sold (mutuellement
exclusives). Ajouter un AXE INDÉPENDANT de chips multi-user (parallèle, pas
mutuellement exclusif avec l'axe d'état actuel) :
- "mes annonces" — j'ai une ligne card_listings.
- "ses annonces" — le partenaire a une ligne card_listings.
- "cross-listées" — les deux ont une ligne card_listings.
- "non listées" — personne n'a de ligne card_listings.
- "to delete" — j'ai card_listings ET cards.status != 'for_sale'.
La sémantique précise (combinaison des deux axes : ET ou OR ?) est à
discuter avec l'utilisateur si ambiguë.

Auth :
- Whitelist 2 emails dans Supabase Auth, rien d'autre côté auth.
- Confirmer l'user_id Supabase de Florent (pour le backfill de la migration)
  et créer le compte de la copine.

==============================================================================
ORDRE & PROCESS
==============================================================================

1. Feature 2 d'abord (schéma card_listings + RLS + flags UI + flow Sold
   modifié + filtres + staleness per-user). Tester avec la base actuelle.
2. Feature 1 ensuite (script Python d'import Vinted) — peut écrire dans
   card_listings une fois Feature 2 livrée.

Process : passer par brainstorming → spec → plan d'implémentation comme
d'habitude. Ce brief est le point de départ, PAS la spec finale.

Pour t'orienter dans le code :
- CLAUDE.md (vue d'ensemble + table "Architecture clé")
- supabase/migrations/20260430130000_phase21_vinted_unique_listed.sql
  (comment vinted_listed_at a été ajouté → c'est ce qu'on remplace)
- composants Vinted listés dans CLAUDE.md (VintedListedToggle, VintedRow,
  SoldModal, PromoteAfterSoldModal, RestockToast, VintedFilters)
- lib/utils/listing-stale.ts (le helper de staleness à appeler par-user)
- app/api/enrich/route.ts (pipeline d'enrichissement à réutiliser depuis
  le script Python — soit en exposant une route, soit en réimplémentant)
- docs/phases-summary.md si besoin de plus de contexte historique