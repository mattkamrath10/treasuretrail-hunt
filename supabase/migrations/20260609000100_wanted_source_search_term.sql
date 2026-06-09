-- Phase 1 Wanted Wizard — demand attribution.
-- Records the failed search term that prompted a Wanted Request so later
-- phases (demand intelligence) can analyse what buyers couldn't find.
-- Idempotent: safe to run multiple times. createWantedItem() degrades
-- gracefully (42703 fallback) until this is applied.
alter table public.wanted_items
  add column if not exists source_search_term text;
