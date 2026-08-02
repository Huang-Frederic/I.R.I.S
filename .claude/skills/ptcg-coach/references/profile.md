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

Vu en plus le 01/08 : **Kassis** (Supporter — Commutateur **ou** +30 contre un
Pokémon-ex Actif, mode largement sous-utilisé), Poké Registre, Cage de Combat,
Cendre Sacrée, Boîte à Secrets, Soutien de Néphie, Civière Nocturne, Shaymin,
Carton Rouge Spécial, Super Bonbon, 2 Ordres du Boss.

⚠️ **Montagne Gravité *et* Cage de Combat sont dans la liste.** Le playbook
tranche pour la Cage seule (Montagne retire 30 PV à ses propres Typhlosion).
Conseil de coupe à re-formuler tant que Montagne Gravité ressort d'une recherche.

---

## Erreurs récurrentes

### `ability_unused` — 2 parties sur 3 (⚠️ **pas reproduit le 01/08**)

**Le motif dominant jusqu'ici.** Il faisait évoluer un Pokémon **sans avoir
déclenché son talent une-fois-par-tour d'abord**. Systématiquement sur Feurisson
de Luth (*Unis par le Voyage*).

- 25/07 vs Amphinobi — deux Feurisson en jeu au tour 5, un seul talent utilisé.
  A coûté le KO raté de 30 points au tour 7, et la partie.
- 26/07 vs Minotaupe — deux fois dans la même partie (tours 5 et 7). Sans coût,
  le matchup a pardonné.
- Même partie : *Ordre de Reconnaissance* de Dispareptil oublié aux tours 9 et 11.
- **01/08 vs Guubeee — corrigé, et proprement.** Tour 8 : *Unis par le Voyage*
  (l. 198) **puis** évolution en Typhlosion (l. 204). Les deux Dispareptil ont
  déclenché *Ordre de Reconnaissance* à chacun de ses tours (T6, T8, T10).

**Piège de lecture à ne pas répéter.** Le tour 6 du 01/08 affiche **trois**
« Unis par le Voyage » non déclenchés — tous marqués `exhausted`. Les 4 Aventure
de Luth étaient déjà hors du deck (2 en défausse, 2 en main ; une avait été
prizée et récupérée au tour 4). Les déclencher n'aurait rien trouvé. Ce n'est
pas la faute habituelle et il ne faut pas la lui compter.

**À vérifier quand même systématiquement.** L'ordre correct reste : **talent
d'abord, évolution ensuite.** Et compter les copies — deux Feurisson = deux
talents, sauf si le deck est vide d'Aventure de Luth.

### `bench_liability` — 1 partie

25/07 : Favianos-ex posé au banc alors qu'il restait 3 récompenses à
l'adversaire. Tiré par Ordres du Boss deux tours plus tard, 2 récompenses,
fin de partie.

### `missed_lethal` — 1 partie

25/07 : Explosion Partenaire à 260 contre 290 nécessaires. Conséquence directe
du talent oublié.

### Réflexes manquants — sans coût pour l'instant

- **Les Outils gratuits restent en main.** 01/08 tour 10 : Bracelet Vaillant en
  main, jamais attaché, alors que c'est gratuit et sans coût d'action. 290
  suffisaient contre 240 PV, donc zéro impact — mais c'est le même geste qui,
  deux tours plus tôt, aurait converti 230 en 260 sur un Pashmilla-ex à 240 PV.
- **Le second mode de Kassis n'existe pas dans sa tête.** Gardée en main du
  tour 1 au tour 7 le 01/08. Il la lit comme un Commutateur ; c'est aussi
  +30 contre un Pokémon-ex Actif, soit exactement le KO manqué au tour 8.

---

## Ce qu'il fait bien

- **Sacrifie ce qui est déjà condamné** — monte le Pokémon déjà endommagé après
  un KO plutôt qu'un frais.
- **Chip damage utile** — a tapé un Rototaupe pour 40 au tour 3 ; les dégâts ont
  survécu à l'évolution en Méga-Minotaupe et ont rendu le KO possible au tour 5.
- **Calcule ses KO** — Fournaise à exactement 50 pour finir un Méga à 290/320.
  Le 01/08 : Fournaise à 40 +10 Victini = 50, ×2 Faiblesse = **exactement** les
  100 PV d'un Métang. Sans Victini au banc, 80 et pas de KO.
- **Sécurise plutôt que d'optimiser** quand la partie est gagnée. À encourager.
- **Pré-construit avant la récompense charnière (P5)** — 01/08 tour 6 : l'énergie
  du tour va sur le Feurisson du **banc**, pas sur l'Actif. Deux tours plus tard,
  Carton Rouge Spécial + OHKO sur l'Actif : le Typhlosion de relève était déjà
  chargé et a réattaqué sans temps mort. C'est le coup qui a tenu la partie.
- **Refuse le pile-ou-face quand une récompense garantie existe** — 01/08 tour 8 :
  plafond à 230 contre un Pashmilla-ex à 240 PV doté d'un talent d'esquive au
  lancer de pièce ; Ordres du Boss sur un Métang à la place, et au passage
  l'accélérateur d'énergie adverse en moins.
- **Ne s'est pas fait piéger par Cendre Sacrée** — jouée juste avant Explosion
  Partenaire le 01/08 sans toucher au compteur de dégâts (elle ne déplace que
  des Pokémon, le compteur porte sur les Aventure de Luth).
- **Choisit ses coûts de défausse** — 01/08 tour 10 : Boîte à Secrets payée en
  **gardant** l'Aventure de Luth pour la jouer ensuite. Résultat : les 4 AdL en
  défausse (240 dégâts) **et** l'Énergie Feu sans laquelle l'Actif à 0 énergie
  n'attaquait pas.
- **Remplace le Stade adverse** — 01/08 : Cage de Combat sur Usine de la Team
  Rocket, un robinet à 2 cartes par tour pour un deck Team Rocket. Geste que les
  débutants oublient presque toujours.

---

## Points de règle sur lesquels le corriger

Rien pour l'instant. Ajoute ici toute règle qu'il a manifestement ignorée — c'est
ce qui distingue une erreur de jugement d'un trou de connaissance, et les deux ne
se corrigent pas pareil.

Le 01/08, aucun trou : il n'a pas tenté de double-évolution sur un Pokémon
fraîchement évolué (tour 6, il évolue le Feurisson en place depuis le tour 4 et
laisse celui du tour en cours), et il a payé la retraite au coût exact.

---

## Journal des parties

| Date | Adversaire | Résultat | Motifs relevés |
|---|---|---|---|
| 2026-07-25 | Bklee219 — Méga-Amphinobi-ex | Défaite 3-6 | `ability_unused`, `bench_liability`, `missed_lethal`, `promote_misplay` |
| 2026-07-26 | Fumpky — Méga-Minotaupe-ex | Victoire 6-1 | `ability_unused` ×4 |
| 2026-08-01 | Guubeee — Métalosse / Pashmilla-ex (Métal) | Victoire 6-2 | **aucun** — 1 `note` d'arbitrage (carburant Aventure de Luth). Score 100. |

**Tendance après 3 parties.** `ability_unused` était le motif systématique ; il
disparaît le 01/08 sur une partie où l'ordre talent-puis-évolution comptait
vraiment. Le prochain axe de progression n'est plus les talents oubliés mais la
**gestion du plafond de dégâts** : savoir, à chaque tour, combien d'Aventure de
Luth sont en défausse et ce que ça autorise comme KO. C'est ce qui a fait la
différence entre 230 et 240 au tour 8.
