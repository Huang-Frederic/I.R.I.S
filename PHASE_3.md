> **Brief historique — TERMINÉ.** Phase 3c shippé en plusieurs volets non prévus initialement (Volet 3 multilang resilience, Volet 5 catalog scraper illustrator, switch modèle gemini-3.1-flash-lite-preview). Voir `docs/phases-summary.md` pour ce qui a réellement été livré.

# Phase 3 : bulk vendu + Gemini Tokens Optimisation

## Bulk Vendu 

-> La description est à refaire, avec plus de details. 

On crée le bouton avec le selecteur pour dire quel cartes ont étés vendus en même temps, on definit le prix de vente et on divise par le nombre de cartes pour avoir le prix de vente individuel. 

## Gemini Tokens Optimisation

### Tâche — deux volets à faire dans l'ordre :

#### Volet 1 — Optimisation coût Gemini (lib/api/gemini-vision.ts)

-> Ce prompt sert de directives mais pas definitif, si il y a des incoherences ou des choses qui ne sont pas logique, à signaler à l'User. 

Analyser le fichier et appliquer les optimisations suivantes :

Logger usageMetadata après chaque appel réussi. Extraire promptTokenCount, candidatesTokenCount, totalTokenCount depuis data.usageMetadata (déjà présent dans la réponse brute de l'API). Calculer le coût estimé en EURO (promptTokenCount * 0.50/1M + candidatesTokenCount * 3.00/1M). Logger en console avec le format [Gemini] {promptTokenCount}in / {candidatesTokenCount}out / {imageTokens}img — $X.XXXXXX.

Ajouter maxOutputTokens: 300 dans generationConfig pour éviter les dérives de verbosité.

Raccourcir le prompt sans dégrader la qualité d'extraction. Supprimer les redondances, raccourcir les exemples, mais conserver toutes les instructions métier (format set_code exact, zéros initiaux, distinction Trainer/Energy/Stadium pour pokemon_number, etc.).

Retourner les données de tokens : modifier la signature de retour pour inclure un champ optionnel _usage?: { tokens_in: number; tokens_out: number; tokens_total: number; cost_usd: number } en plus du résultat OCR existant. Ne pas casser le contrat actuel — le champ est optionnel et absent si usageMetadata est indisponible.

Image tokens : Gemini ne retourne pas les tokens image séparément dans usageMetadata (ils sont inclus dans promptTokenCount). Estimer la part image via imageTokens = promptTokenCount - PROMPT_TOKEN_ESTIMATE où PROMPT_TOKEN_ESTIMATE est une constante locale égale au nombre approximatif de tokens du prompt texte seul (à calculer une fois et hardcoder comme constante).

Volet 2 — Affichage dans le scanner UI (components/submit/CardScanForm.tsx)

Dans le snippet de résultat OCR (la zone qui affiche les champs extraits après un scan), ajouter en bas :

Un <Separator /> (composant existant ou <hr> avec les styles du projet)

Une ligne de debug discrète (text-xs text-muted-foreground) affichant : {tokens_in} in · {tokens_out} out · ~{imageTokens} img · $X.XXXXXX

Ce bloc n'apparaît que si _usage est présent dans la réponse OCR (guard _usage &&)

Propager _usage depuis app/api/ocr/route.ts → CardScanForm.tsx : ajouter le champ dans le type de réponse OCR et le passer jusqu'au composant

Contraintes :

0 lint warning, 0 type error, tests existants doivent passer

Mettre à jour les tests Vitest concernés si la signature de extractCardFromImage change

Ne pas modifier le comportement du fallback Google Vision

Le champ _usage est purement informatif, jamais persisté en base