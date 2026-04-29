# I.R.I.S — Guide de setup local

Ce guide explique comment configurer ton environnement pour faire tourner I.R.I.S en local. À faire en parallèle du développement de la Phase 1.

## 0. Prérequis

- **Node.js 22 LTS** (installé via nvm conseillé). Vérifie avec `node --version` (doit afficher `v22.x`).
- **Supabase CLI** : sera installé en Phase 1.3 (`npx supabase ...`), pas besoin de l'installer globalement.
- **Compte GitHub** (pour le déploiement Vercel ultérieur).
- **Compte Vercel** (Phase 4, pas bloquant).

---

## 1. Créer le projet Supabase

Phase 1 — **bloquant** pour pouvoir lancer l'app en local avec auth + DB.

### 1.1 Créer le projet

1. Va sur [https://supabase.com](https://supabase.com), inscris-toi (Google / GitHub OK).
2. Clique sur **New project**.
3. Choisis ton organisation (par défaut, la tienne).
4. Renseigne :
   - **Name** : `iris` (ou ce que tu veux)
   - **Database Password** : génère un mot de passe fort (Supabase peut le faire) → **garde-le précieusement**, tu en auras besoin pour la CLI
   - **Region** : `Frankfurt (eu-central-1)` (ou la plus proche de Vercel pour réduire la latence)
   - **Plan** : Free tier (largement suffisant pour I.R.I.S)
5. Attends 2-3 minutes que le projet soit provisionné.

### 1.2 Récupérer les clés API

Une fois le projet créé, dans le dashboard Supabase :

1. Va dans **Project Settings** (icône engrenage) → **API**.
2. Copie ces 3 valeurs dans ton fichier `.env.local` (à créer à la racine du projet, copier `.env.example` comme base) :

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6Ik...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6Ik...
   ```

   - `NEXT_PUBLIC_SUPABASE_URL` : ligne **Project URL**
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` : ligne **Project API keys → anon public**
   - `SUPABASE_SERVICE_ROLE_KEY` : ligne **Project API keys → service_role secret** ⚠️ **JAMAIS exposée côté client, JAMAIS commitée**

### 1.3 Créer le user mono-utilisateur

L'app I.R.I.S est mono-utilisateur. Crée ton compte :

1. Dans le dashboard Supabase → **Authentication** → **Users** → **Add user → Create new user**.
2. Renseigne email + mot de passe. Désactive l'envoi d'email d'invitation.
3. Note ces credentials — c'est avec ça que tu te connecteras à I.R.I.S.

### 1.4 Storage buckets

Les buckets `card-photos` et `lot-photos` seront créés automatiquement par la migration Supabase en 1.3 du plan. Pas d'action manuelle nécessaire pour le moment.

---

## 2. Google Cloud Vision API

Phase 1 — **bloquant** pour le scan OCR.

### 2.1 Créer un projet Google Cloud

1. Va sur [https://console.cloud.google.com](https://console.cloud.google.com).
2. Clique sur le sélecteur de projet (en haut) → **NOUVEAU PROJET**.
3. **Nom** : `iris` (ou ce que tu veux). Pas besoin d'organisation.
4. **CRÉER**. Attends 30 secondes.

### 2.2 Activer la facturation

Vision API est gratuite jusqu'à 1000 unités/mois (largement suffisant pour un usage perso), mais Google **exige** un compte de facturation valide même pour le tier gratuit.

1. Menu hamburger → **Facturation** → **Lier un compte de facturation**.
2. Crée un compte ou lie un existant (CB requise). Tu ne seras pas facturé tant que tu restes sous les quotas gratuits.

### 2.3 Activer l'API Vision

1. Menu → **APIs et services** → **Bibliothèque**.
2. Recherche **Cloud Vision API**.
3. Clique → **ACTIVER**.

### 2.4 Créer une clé API

1. Menu → **APIs et services** → **Identifiants**.
2. Clique **+ CRÉER DES IDENTIFIANTS** → **Clé API**.
3. Copie la clé qui apparaît → colle-la dans `.env.local` :

   ```env
   GOOGLE_VISION_API_KEY=AIzaSy...
   ```

### 2.5 Restreindre la clé (recommandé)

Toujours dans **Identifiants**, clique sur ta clé pour l'éditer :

1. **Restrictions d'application** : aucune (pour le moment, on appellera depuis le serveur Next.js).
2. **Restrictions d'API** : sélectionne **Restreindre la clé** → coche uniquement **Cloud Vision API**.
3. **ENREGISTRER**.

---

## 3. Gemini API (Phase 1.12 — moteur OCR primaire)

Phase 1.12 — **bloquant pour atteindre les 93% accuracy OCR**. Sans Gemini, l'app fonctionne (Vision fallback) mais l'enrichissement plafonne à ~63%.

### 3.1 Récupérer une clé Gemini

1. Va sur [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey).
2. Clique **Create API key**. Tu peux la rattacher à ton projet GCP existant (celui de Vision API) — c'est même conseillé pour centraliser la facturation.
3. Copie la clé dans `.env.local` :

   ```env
   GEMINI_API_KEY=AIzaSy...
   ```

### 3.2 Activer la facturation Tier 1

Le free tier de Gemini limite à 5 requêtes/min, ce qui est trop peu pour un usage scan répété. Activer la facturation passe automatiquement en **Tier 1** (15 req/min, suffisant pour usage mono-utilisateur).

1. Dans la GCP console → **Facturation** → vérifie que ton projet est rattaché à un compte de facturation valide (le même que pour Vision).
2. Coût estimé : **~6¢/mois pour 100 scans** (input ~200 tokens + output ~50 tokens à $0.075/$0.030 par 1M tokens). Reste largement dans le free tier facturé.

### 3.3 Note sur le modèle

Le code utilise `gemini-3-flash-preview` (pinné dans `lib/api/gemini-vision.ts`). C'est un modèle **preview** — Google peut le renommer ou le retirer sans préavis. Si l'OCR commence à retourner null en boucle, vérifier la disponibilité du modèle ou basculer sur l'alias `gemini-flash-latest`.

---

## 4. Anthropic API (optionnel — uniquement pour les benchmarks)

`scripts/test-bench-claude.ts` utilise Claude Haiku 4.5 pour comparer les modèles vision. Bench abandonné (Claude refuse d'extraire l'info), mais le script reste pour traçabilité.

```env
ANTHROPIC_API_KEY=sk-ant-...
```

Ne pas activer pour l'usage runtime — pure devtool.

---

## 5. Variable `CRON_SECRET`

Pour protéger l'endpoint `/api/prices/update` (Phase 3), génère un token aléatoire :

```bash
openssl rand -hex 32
```

Copie le résultat dans `.env.local` :

```env
CRON_SECRET=abc123def456...
```

---

## 6. Récapitulatif `.env.local`

Une fois la Phase 1 prête, ton fichier doit ressembler à ça :

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

GOOGLE_VISION_API_KEY=AIzaSy...   # OCR fallback
GEMINI_API_KEY=AIzaSy...          # OCR primaire (Phase 1.12)
ANTHROPIC_API_KEY=                # optionnel (scripts uniquement)
POKEMON_TCG_API_KEY=              # legacy, plus utilisé en runtime

CRON_SECRET=                      # Phase 3
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Note Cardmarket API** : l'API a été fermée aux nouvelles applications en 2023. Le catalogue est désormais peuplé via scraping LimitlessTCG (`scripts/scrape-limitlesstcg.ts`). Les variables `MKM_*` ne sont plus nécessaires.

**Note WSL2 / scraping** : si l'exécution de `scripts/scrape-limitlesstcg.ts` échoue avec `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, lancer `export INSECURE_HTTPS=1` avant le script — contournement temporaire pour les certificats rejetés par Node 22 sur WSL2 derrière un proxy corporate.

⚠️ **Ne jamais commiter `.env.local`** — il est déjà dans `.gitignore`.

---

## 7. Appliquer la migration Supabase

La migration `supabase/migrations/20260425224142_initial_schema.sql` doit être appliquée à ton projet Supabase distant. Deux options :

### Option A — via la CLI Supabase (recommandé)

```bash
# 1. Lier le projet local au projet Supabase distant (à faire une seule fois)
npx supabase login                                  # ouvre le navigateur pour s'authentifier
npx supabase link --project-ref <PROJECT_REF>       # PROJECT_REF = la partie xxxxx de https://xxxxx.supabase.co

# 2. Appliquer la migration
npx supabase db push                                # demandera le mot de passe DB défini en 1.1
```

Pour les migrations futures, créer un nouveau fichier avec `npx supabase migration new <nom>` puis re-`db push`.

### Option B — via le SQL Editor du dashboard Supabase

Copier-coller le contenu de `supabase/migrations/20260425224142_initial_schema.sql` dans le SQL Editor du dashboard Supabase, puis exécuter. Plus rapide pour la première fois mais on perd la traçabilité.

---

## 8. Lancement local

Une fois les comptes Supabase et Google Vision configurés, et la migration Supabase appliquée (étape 7) :

```bash
npm run dev
```

L'app sera disponible sur [http://localhost:3000](http://localhost:3000).

Si tu testes le scan OCR depuis ton mobile, il faudra exposer le serveur en HTTPS :

```bash
npx next dev --experimental-https
```

(Génère un certificat auto-signé, accepte l'avertissement dans le navigateur.)
