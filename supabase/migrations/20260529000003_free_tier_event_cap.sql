-- ============================================================================
-- Free-tier event cap (server-side backstop)
-- ----------------------------------------------------------------------------
-- Free accounts may keep only ONE active *local* event at a time; Pro is
-- unlimited. The seller form pre-checks this for friendly UX, but the client
-- check can be bypassed (direct API call), so this BEFORE INSERT/UPDATE trigger
-- is the real enforcement.
--
-- Rules:
--   * Only ACTIVE LOCAL events count: event_kind = 'local' AND status <> 'cancelled'.
--     Online live shows and cancelled/draft-cancelled rows are exempt.
--   * Pro members (profiles.membership_tier = 'pro' OR pro_member = true) bypass.
--   * Service-role connections (server grants, admin tooling) bypass entirely,
--     mirroring the escalation-guard pattern used elsewhere.
--
-- AGENT NOTE: the agent cannot apply Supabase DDL. Apply this by either running
-- the migration, or pasting the body below into the Supabase SQL editor.
-- ============================================================================

create or replace function public.enforce_free_tier_event_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier   text;
  v_pro    boolean;
  v_count  int;
  v_limit  int := 1;  -- keep in sync with FREE_TIER_EVENT_LIMIT in entitlements.ts
begin
  -- Service-role (server grants / admin tooling) bypasses the cap.
  if auth.role() = 'service_role' then
    return new;
  end if;

  -- Only active local events count toward the cap.
  if new.event_kind is distinct from 'local' or new.status = 'cancelled' then
    return new;
  end if;

  select membership_tier, pro_member
    into v_tier, v_pro
    from public.profiles
   where id = new.holder_id;

  -- Pro members are unlimited.
  if v_tier = 'pro' or coalesce(v_pro, false) then
    return new;
  end if;

  -- Count the holder's OTHER active local events (exclude this row on update;
  -- on insert new.id is already populated from the column default).
  select count(*)
    into v_count
    from public.events
   where holder_id = new.holder_id
     and event_kind = 'local'
     and status <> 'cancelled'
     and id <> new.id;

  if v_count >= v_limit then
    raise exception
      'FREE_TIER_EVENT_LIMIT: free accounts can have % active local event(s). Upgrade to Pro for unlimited events.', v_limit
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_free_tier_event_cap on public.events;
create trigger trg_enforce_free_tier_event_cap
  before insert or update on public.events
  for each row execute function public.enforce_free_tier_event_cap();
