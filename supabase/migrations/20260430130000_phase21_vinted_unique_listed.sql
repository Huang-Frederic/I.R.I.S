-- I.R.I.S — Phase 2.1: Vinted unicité for_sale + colonne vinted_listed_at
-- Spec: docs/superpowers/specs/2026-04-30-phase-2-vinted-design.md (Phase 2.1 update)
--
-- 1. Empêche les doublons for_sale (même card_id_tcg + langue + condition + variant)
-- 2. Ajoute vinted_listed_at pour tracker "publié sur Vinted.com"

-- =============================================================================
-- 1. Partial unique index : 1 seule carte for_sale par groupe
-- =============================================================================
-- COALESCE handle NULL values: card_id_tcg can be NULL (catalogue miss),
-- variant can be NULL (= standard).
--
-- NOTE: Si des doublons for_sale existent déjà dans la DB, cet index échouera
-- lors de l'application. L'utilisateur devra d'abord nettoyer manuellement
-- (mono-user app, décision à prendre au cas par cas).
create unique index one_for_sale_per_group
  on cards (
    coalesce(card_id_tcg, ''),
    language,
    condition,
    coalesce(variant, 'standard')
  )
  where status = 'for_sale';

-- =============================================================================
-- 2. Colonne vinted_listed_at + index pour le sort
-- =============================================================================
alter table cards add column vinted_listed_at timestamptz;

-- Index pour le tri "en ligne par date desc" sur la page Vinted
create index idx_cards_vinted_listed_at
  on cards (vinted_listed_at desc nulls last)
  where status = 'for_sale';
