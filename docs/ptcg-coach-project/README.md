# Coach PTCG en Projet claude.ai

Alternative au skill `.claude/skills/ptcg-coach/`, pour analyser une partie
depuis le téléphone. Un Projet marche dans l'app mobile ; un skill demande
l'exécution de code et s'installe depuis le web.

## Installation, une fois

1. Sur claude.ai, crée un Projet — par exemple « Coach PTCG ».
2. Colle le contenu de [`instructions.md`](./instructions.md) dans les
   instructions personnalisées du projet. Rien d'autre : ce fichier ne contient
   que le texte à coller, pas de préambule.
3. Ajoute deux fichiers à la connaissance du projet :
   - `.claude/skills/ptcg-coach/references/rules.md`
   - `.claude/skills/ptcg-coach/references/profile.md`

## Après chaque partie

1. Dans IRIS, `/ptcg/import` : colle le battle log, choisis la date, **Read the
   log**.
2. **Copier** le digest (ou le télécharger sur ordinateur).
3. Dans le Projet, nouvelle conversation, colle le digest.
4. Copie le bloc `json` de la réponse.
5. Retour sur `/ptcg/import`, étape 3 : colle-le et importe.

Sur téléphone tout passe par le presse-papiers — aucun fichier à manipuler.

## Les deux différences avec le skill

**Le mode « log brut » n'existe pas ici.** Le skill sait lancer le parser
lui-même quand il tourne dans le dépôt. Un Projet ne le peut pas, et n'en a pas
besoin : IRIS fait ce travail, et c'est le même code.

**`profile.md` ne se met plus à jour tout seul.** Le skill le réécrit après
chaque analyse ; un fichier de connaissance est en lecture seule. IRIS reste la
source canonique — il agrège les motifs dans `ptcg_analyses.patterns` — mais il
faut re-téléverser `profile.md` de temps en temps pour que le Projet reste au
courant des habitudes récentes.

## Quand ça change

Les instructions et le skill décrivent la même méthode et doivent rester
d'accord. Après avoir modifié `.claude/skills/ptcg-coach/SKILL.md`, regarde si
le changement touche la méthode, le barème du score ou le format de sortie — si
oui, reporte-le ici et recolle les instructions dans le Projet.

Rien ne le vérifie automatiquement : contrairement au zip, ce fichier est une
réécriture et non une copie, donc aucune comparaison d'octets n'a de sens.
