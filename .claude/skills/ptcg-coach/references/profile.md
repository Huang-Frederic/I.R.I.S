# Profil de Frédéric — erreurs récurrentes et contexte

**Lis ce fichier avant d'analyser. Mets-le à jour après.**

C'est la mémoire du coach entre les conversations. Il transforme des débriefs
isolés — lus une fois puis oubliés — en suivi d'habitudes. Une erreur commise
trois fois n'a pas le même statut qu'une erreur commise une fois : dis-le.

> Ce fichier **reflète** ce qu'IRIS agrège dans `ptcg_analyses.patterns`. IRIS
> reste la source canonique ; ceci est la copie de travail, utilisable quand tu
> n'as pas accès à la base. En cas de divergence, IRIS a raison.

---

## Niveau et contexte

Débutant, a commencé le TCG Pokémon vers juin 2026. Joue sur PTCG Live, en
français. Vise les fuites qui coûtent des parties, pas les lignes optimales à
trois coups d'avance.

## Deck principal

**Typhlosion de Luth** (Héricendre / Feurisson / Typhlosion de Luth, sv10).

Moteur : *Explosion Partenaire* = 40 + **60 par carte Aventure de Luth dans la
défausse**. Aventure de Luth est un **Supporter** — une seule jouée par tour.
Mais une carte **défaussée** compte pareil qu'une carte jouée : Hyper Ball
(2 cartes) et Boîte à Secrets (3 cartes) sont des accélérateurs de dégâts.

Faiblesse Eau ×2 sur toute la ligne. Support vu en jeu : Victini (*Cri de
Victoire*, +10 aux Pokémon Feu évolutifs), Dispareptil (*Ordre de
Reconnaissance*), Favianos-ex (*Renverser la Tendance*), Bracelet Vaillant,
Montagne Gravité.

---

## Erreurs récurrentes

### `ability_unused` — 2 parties sur 2

**Le motif dominant.** Il fait évoluer un Pokémon **sans avoir déclenché son
talent une-fois-par-tour d'abord**. Systématiquement sur Feurisson de Luth
(*Unis par le Voyage*).

- 25/07 vs Amphinobi — deux Feurisson en jeu au tour 5, un seul talent utilisé.
  A coûté le KO raté de 30 points au tour 7, et la partie.
- 26/07 vs Minotaupe — deux fois dans la même partie (tours 5 et 7). Sans coût,
  le matchup a pardonné.
- Même partie : *Ordre de Reconnaissance* de Dispareptil oublié aux tours 9 et 11.

**À vérifier systématiquement.** L'ordre correct est toujours : **talent d'abord,
évolution ensuite.** Et compter les copies — deux Feurisson = deux talents.

### `bench_liability` — 1 partie

25/07 : Favianos-ex posé au banc alors qu'il restait 3 récompenses à
l'adversaire. Tiré par Ordres du Boss deux tours plus tard, 2 récompenses,
fin de partie.

### `missed_lethal` — 1 partie

25/07 : Explosion Partenaire à 260 contre 290 nécessaires. Conséquence directe
du talent oublié.

---

## Ce qu'il fait bien

- **Sacrifie ce qui est déjà condamné** — monte le Pokémon déjà endommagé après
  un KO plutôt qu'un frais.
- **Chip damage utile** — a tapé un Rototaupe pour 40 au tour 3 ; les dégâts ont
  survécu à l'évolution en Méga-Minotaupe et ont rendu le KO possible au tour 5.
- **Calcule ses KO** — Fournaise à exactement 50 pour finir un Méga à 290/320.
- **Sécurise plutôt que d'optimiser** quand la partie est gagnée. À encourager.

---

## Points de règle sur lesquels le corriger

Rien pour l'instant. Ajoute ici toute règle qu'il a manifestement ignorée — c'est
ce qui distingue une erreur de jugement d'un trou de connaissance, et les deux ne
se corrigent pas pareil.

---

## Journal des parties

| Date | Adversaire | Résultat | Motifs relevés |
|---|---|---|---|
| 2026-07-25 | Bklee219 — Méga-Amphinobi-ex | Défaite 3-6 | `ability_unused`, `bench_liability`, `missed_lethal`, `promote_misplay` |
| 2026-07-26 | Fumpky — Méga-Minotaupe-ex | Victoire 6-1 | `ability_unused` ×4 |
