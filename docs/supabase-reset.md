# I.R.I.S — Reset Supabase (nouveau projet)

Procédure complète pour passer le projet sur un nouveau Supabase (changement de region, projet pollué, repartir de zéro).

## 0. Pré-requis

- Node 22 (`source ~/.nvm/nvm.sh && nvm use 22`)
- Nouveau projet Supabase déjà créé sur le dashboard
- Mot de passe de la DB Supabase à portée
- `psql` installé (ou utiliser le SQL Editor en fallback)

---

## 1. Récupérer les clés du nouveau projet

Sur **https://supabase.com/dashboard** → ton projet → **Project Settings** → **API** :

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **Project API keys → anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Project API keys → service_role secret** → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ jamais commitée

Mettre à jour `.env.local` à la racine du repo avec ces 3 valeurs.

Le **PROJECT_REF** = la partie `xxxx` de `https://xxxx.supabase.co`. On en aura besoin à l'étape 3.

---

## 2. Créer le user mono-utilisateur

Dashboard Supabase → **Authentication** → **Users** → **Add user → Create new user** :
- Email + mot de passe (désactiver l'email d'invitation)
- C'est avec ces credentials que tu te connecteras à I.R.I.S

---

## 3. Appliquer les migrations

```bash
# Re-lier la CLI au nouveau projet (la conf locale .supabase/ pointe peut-être encore sur l'ancien)
rm -rf .supabase                                    # nettoie la conf locale (safe, c'est juste un cache)
npx supabase login                                  # si pas déjà connecté
npx supabase link --project-ref <NOUVEAU_PROJECT_REF>

# Pousser TOUTES les migrations dans l'ordre
npx supabase db push --include-all
```

Les 5 migrations doivent passer sans erreur :
1. `20260425224142_initial_schema.sql`
2. `20260428114538_tcg_catalog.sql`
3. `20260429142350_add_cards_variant.sql`
4. `20260430130000_phase21_vinted_unique_listed.sql`
5. `20260430200000_fix_replace_pokedex_card_3step.sql`

**Vérification rapide** dans le SQL Editor :

```sql
\dt                                                 -- doit lister cards, lots, config, rarity_ranks, tcg_catalog
\d cards                                            -- doit montrer la colonne variant + vinted_listed_at
select count(*) from tcg_catalog;                   -- doit être 0 (catalogue pas encore peuplé, étape 4)
```

---

## 4. Peupler le catalogue TCG (LimitlessTCG)

Le catalogue (`tcg_catalog`, 111K cartes JP/EN/FR/DE/IT/ES/PT) est rempli par scraping. **~12 minutes** sur connexion correcte.

```bash
# Charge les vars d'env du nouveau .env.local
source ~/.nvm/nvm.sh && nvm use 22
npx tsx scripts/scrape-limitlesstcg.ts
```

Si erreur `UNABLE_TO_VERIFY_LEAF_SIGNATURE` (Node 22 sur WSL2 derrière un proxy strict) :

```bash
export INSECURE_HTTPS=1
npx tsx scripts/scrape-limitlesstcg.ts
```

**Vérification** :

```sql
select language, count(*) from tcg_catalog group by 1 order by 1;
-- attendu : ~7 lignes (de, en, es, fr, it, jp, pt) totalisant ~111000
```

---

## 5. Seed des cartes de test (optionnel mais recommandé)

Pour avoir tout de suite ~30 cartes représentatives (couvre tous les flows UI : sold, pokedex, collection, for_sale online/offline/stale) :

```bash
npx tsx scripts/seed/seed.ts
```

Le script wipe la table `cards` puis insère depuis `cards_assets/` (~30 photos JP scannées). Distribution garantie :
- 2 sold (avec `date_sold` récent + `sold_price`)
- 5 pokedex (pokemon_number unique)
- 5 collection (Stock)
- 3 for_sale **stale** (`vinted_listed_at` 25-34 jours, apparaissent dans "À rafraîchir")
- 3 for_sale **fresh online** (`vinted_listed_at` 0-13 jours)
- ~12 for_sale **offline** (`vinted_listed_at = null`)

**Vérification** :

```sql
select status, count(*) from cards group by 1 order by 1;
-- collection: 5, for_sale: ~18, pokedex: 5, sold: 2
```

---

## 6. Lancer l'app + tester

```bash
rm -rf .next                                        # vider le cache Next (au cas où)
npm run dev
```

App sur **http://localhost:3000**. Login avec le user créé à l'étape 2.

**Smoke test minimal** :
- [ ] `/pokedex` : 5 cartes affichées, search fonctionne, click sur slot manquant → drawer + bouton "Scanner une carte"
- [ ] `/stock` : 5 cartes en collection, badge Pokédex/Pas Pokédex visible, +/- du compteur fonctionne (clone via `/api/cards/[id]/clone`)
- [ ] `/vinted` : ~18 cartes for_sale, 3 dans "À rafraîchir", toggle 3 états cliquable
- [ ] `/options` : ThemeToggle 2 boutons, SignOut fonctionne

---

## 7. Si quelque chose casse

| Symptôme | Cause probable | Fix |
|---|---|---|
| `db push` échoue sur la migration 1 (`relation already exists`) | Conf locale Supabase pointe encore sur l'ancien projet | `rm -rf .supabase && npx supabase link --project-ref <NOUVEAU>` |
| `db push` échoue sur la migration 4 ou 5 mais 1-3 sont OK | La 1 a déjà été appliquée manuellement, la CLI ne le sait pas | `npx supabase migration repair --status applied <TIMESTAMP>` pour chaque migration déjà passée |
| `/api/cards/[id]/clone` retourne 404 alors que le fichier existe | Cache `.next/` stale | `rm -rf .next && npm run dev` |
| Login renvoie 401 | User pas créé ou mauvais .env.local | Vérifier l'auth user dans le dashboard + recharger les vars |
| `tcg_catalog` vide après scraping | Erreur silencieuse sur le scrape (timeout, certif) | Re-run avec `INSECURE_HTTPS=1`, ou vérifier les logs du script |

---

## 8. Ce qu'il faut **fournir** à un agent IA pour qu'il t'aide

Si un agent doit appliquer ce playbook à ta place, il a besoin de :

1. **`.env.local` à jour** avec les nouvelles clés Supabase (URL, anon, service_role) — c'est lui-même qui les met dedans après que tu lui aies copié les valeurs.
2. **`PROJECT_REF`** du nouveau projet Supabase pour la commande `link`.
3. **Mot de passe DB** Supabase (uniquement si la commande `db push` le redemande — la CLI le cache normalement après le premier `link`).
4. **Email + mot de passe du user mono-utilisateur** que tu as créé à l'étape 2 (l'agent en a besoin si tu veux qu'il teste l'app après setup).
5. Confirmation que tu autorises l'agent à lancer `scripts/scrape-limitlesstcg.ts` (~12 min, ~50MB de download) et `scripts/seed/seed.ts` (wipe + repopulate).

Sans ces 5 infos, l'agent ne peut que valider le code, pas exécuter le setup.
