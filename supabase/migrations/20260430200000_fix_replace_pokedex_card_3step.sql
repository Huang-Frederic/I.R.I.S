-- I.R.I.S — Fix: replace_pokedex_card RPC must handle for_sale unique constraint
--
-- BUG: the original 2-step RPC (demote old → promote new) would fail when
-- old_new_status = 'for_sale' AND the candidate (new_card_id) was currently
-- in for_sale of the same (card_id_tcg, language, condition, variant) group.
--
-- Sequence with the bug:
--   1. UPDATE old SET status='for_sale'  ← UNIQUE VIOLATION on
--                                          one_for_sale_per_group, because
--                                          the candidate is still for_sale.
--   2. UPDATE new SET status='pokedex'   ← never reached.
--
-- FIX: park `old` in 'collection' first, then move `new` to 'pokedex' (which
-- frees its for_sale slot if it had one), THEN move `old` to its target
-- status. By the time `old` lands in for_sale, the candidate has vacated
-- the slot.
--
-- Sequence (fixed):
--   1. UPDATE old SET status='collection' ← always safe (no constraint).
--   2. UPDATE new SET status='pokedex'    ← frees for_sale slot, fills the
--                                           pokedex slot we just emptied.
--   3. UPDATE old SET status=target       ← lands cleanly. If target is
--                                           'collection', the third UPDATE
--                                           is a no-op.
--
-- This still fails (correctly) if a THIRD card of the same group is currently
-- for_sale (i.e. an unrelated conflict not involving the swap pair) — that
-- case represents real corruption the user must resolve manually.

create or replace function replace_pokedex_card(
  old_card_id uuid,
  old_new_status card_status,
  new_card_id uuid
) returns void as $$
begin
  -- Step 1: park `old` somewhere with no unique constraint.
  update cards set status = 'collection' where id = old_card_id;
  -- Step 2: promote candidate. Frees the for_sale slot if it had one.
  update cards set status = 'pokedex' where id = new_card_id;
  -- Step 3: move `old` to its final destination. for_sale slot is free now.
  update cards set status = old_new_status where id = old_card_id;
end;
$$ language plpgsql;
