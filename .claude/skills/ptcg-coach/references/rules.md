# Règles du JCC Pokémon — Standard 2026

Vérifiées le 26 juillet 2026 contre le **livret officiel** (*Pokémon Trading Card
Game Rules*, « LAST UPDATED: JULY 2026 »), le **Compendium de jugement** et
Bulbapedia. Les citations entre guillemets sont l'original anglais.

- Livret : `https://www.pokemon.com/static-assets/content-assets/cms2/pdf/trading-card-game/rulebook/pbl_rulebook_en.pdf`
- Compendium : `https://compendium.pokegym.net/`

**Format Standard 2026** : marques de réglementation **H, I, J**. Le G est sorti
le 10 avril 2026. V / VMAX / VSTAR / Radieux ne sont plus en Standard.

Consulte ce fichier **dès qu'un point de règle influence un jugement**. Ne
raisonne jamais de mémoire sur ces points — plusieurs sont contre-intuitifs, et
au moins un est massivement mal rapporté en ligne (voir Méga-Évolutions).

---

## Ce qui survit à l'évolution

> « When a Pokémon evolves, it **keeps all attached cards** […] **and any damage
> counters on it**. Any effects of attacks or Special Conditions affecting the
> Pokémon—such as Asleep, Confused, or Poisoned—**end when it evolves**. »

- **Les marqueurs de dégâts restent.** C'est la règle la plus productive en
  analyse : taper un Base pour 40 rend un KO possible deux tours plus tard sur
  le Niveau 2 qu'il devient.
- Les États Spéciaux et effets d'attaque **disparaissent** — à l'évolution, à la
  dévolution, et au passage sur le Banc.
- Le Pokémon ne peut pas utiliser les attaques ou talents de son stade précédent.

## Limites par tour

| Action | Limite |
|---|---|
| Supporter | **1** |
| Stade | **1** |
| Objets | illimité |
| Outils Pokémon | illimité (mais **1 seul attaché par Pokémon**) |
| Attacher une énergie depuis la main | **1** |
| Retraite | **1** |
| Évolutions | 1 par Pokémon (pas de limite globale) |

Les capacités et attaques qui attachent depuis le deck ou la défausse **ne
consomment pas** l'attache du tour.

## Banc

Maximum **5** Pokémon, en toutes circonstances.

## Évolution — trois interdictions

> « Neither player can evolve a Pokémon **on its first turn in play**. When you
> evolve a Pokémon, it **is new in play, so you can't evolve it a second time the
> same turn**. Neither player can evolve a Pokémon on **that player's first turn**. »

1. Pas sur un Pokémon **posé ce tour-ci**.
2. Pas **deux fois** le même tour sur le même Pokémon.
3. Pas au **premier tour** — pour les **deux** joueurs, chacun à son propre premier tour.

Corollaire : Base → Niveau 1 → Niveau 2 prend **trois tours** sans Super Bonbon.

C'est la règle n°1 qui permet au parser de désambiguïser les cartes en double.

## Le joueur qui commence

| Action à son 1er tour | Autorisé |
|---|---|
| Attaquer | ❌ |
| Jouer un Supporter | ❌ |
| Faire évoluer | ❌ |
| Attacher une énergie | ✅ |
| Poser des Base au Banc, Objets, Outils, Stade, talents, retraite | ✅ |

⚠️ Le joueur en **second** ne peut pas évoluer non plus à son premier tour — mais
il peut attaquer et jouer un Supporter.

## Calcul des dégâts

Ordre : **base → effets de l'attaquant → Faiblesse → Résistance → effets du
défenseur → conversion en marqueurs** (1 marqueur pour 10 dégâts ; rien si ≤ 0).

- **Faiblesse : ×2** en Standard actuel — mais **la valeur imprimée sur la carte
  fait foi**, toujours.
- **Résistance : −30** en ère Écarlate & Violet. **La majorité des cartes récentes
  n'en ont aucune.**
- **Ni Faiblesse ni Résistance sur les Pokémon de Banc.**
- **Les marqueurs placés par un effet ne sont pas des dégâts** : ils ignorent
  Faiblesse, Résistance et tout autre modificateur. « If an attack tells you to
  place damage counters […] you have **no more calculations** to do. »

**1 marqueur = 10 PV.** KO dès que les dégâts totaux atteignent les PV.

## Récompenses — trois valeurs seulement en Standard 2026

| Type | Récompenses |
|---|---|
| Pokémon ordinaire (sans Rule Box) | **1** |
| Pokémon-ex, Pokémon-Terastal ex | **2** |
| **Méga-Évolution Pokémon-ex** | **3** |

## Méga-Évolutions — attention au piège

> « Unlike the older Mega Evolution Pokémon-EX from the XY Series, **there are no
> special rules** when it comes to playing Mega Evolution Pokémon ex. »

- **AUCUNE règle de fin de tour.** La règle « votre tour se termine » appartient
  aux Méga-Évo Pokémon-**EX** de l'ère XY. De nombreux articles en ligne la
  propagent à tort pour les Méga-Évo Pokémon-**ex** de 2025-2026. Ne l'applique jamais.
- Aucun Spirit Link n'est requis.
- Elles peuvent être **Base, Niveau 1 ou Niveau 2** et suivent les **règles
  d'évolution normales** — donc pas d'évolution sur un Pokémon posé ce tour-ci.
- Certaines sautent un stade : Méga-Gardevoir-ex évolue directement de Kirlia,
  Méga-Lucario-ex de Riolu, Méga-Kangourex-ex se pose directement comme Base.
- Elles **comptent comme Pokémon-ex** pour tout effet visant les ex.
- Elles **n'interagissent pas** avec les cartes XY qui parlent de « Méga-Évolution »
  (celles-ci visent le *stade* MEGA, que les nouvelles n'ont pas).

## Super Bonbon

> « Choose 1 of your **Basic** Pokémon in play. If you have a **Stage 2** card in
> your hand that evolves from that Pokémon, put that card on the Basic Pokémon.
> (This counts as evolving that Pokémon.) **You can't use this card during your
> first turn or on a Basic Pokémon that was put into play this turn.** »

- Base → **Niveau 2 uniquement**. Base → Niveau 1 est impossible depuis l'errata BW.
- ❌ Pas sur un Pokémon posé ce tour-ci. ❌ Pas à ton premier tour.
- Cible Actif **ou** Banc.
- **Compte comme une évolution** : consomme l'évolution du tour pour ce Pokémon
  et retire ses États Spéciaux.
- Le Niveau 2 est **joué depuis la main**, donc les talents déclenchés à la mise
  en jeu fonctionnent (ex. *Règne Infernal* de Dracaufeu ex).
- Aucun talent type « Évolution Adaptative » ne contourne ces interdictions.

## Retraite

- **Une fois par tour.** Défausse **exactement** le coût en énergies — pas plus.
- **Sommeil et Paralysie** empêchent la retraite. Confusion, Poison et Brûlure **non**.
- On peut **attaquer après avoir retraité**.
- Le Pokémon garde ses dégâts et ses cartes attachées ; il perd ses États Spéciaux
  en arrivant au Banc.
- Une retraite légalement entamée s'achève même si un effet la bloque en cours.
- Les effets « ne peut pas battre en retraite » ne bloquent **pas** un changement
  forcé (Ordres du Boss, Commutateur…).

## Stades

- Un seul en jeu. Un nouveau **défausse l'ancien** et met fin à ses effets.
- **Interdit de jouer un Stade du même nom** que celui déjà en jeu.
- Un Stade par tour.

---

## Point non sourcé

La valeur en récompenses des **Pokémon Radieux** (1, par déduction) n'a pas pu
être confirmée par une phrase officielle explicite. Sans impact en Standard 2026 :
ils sont hors format depuis la rotation 2025.
