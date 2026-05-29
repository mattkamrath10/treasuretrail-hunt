-- ============================================================================
-- Pro Reach Analytics — data-layer entitlement (SECURITY DEFINER RPC)
-- ----------------------------------------------------------------------------
-- The Reach Analytics dashboard is a Pro feature. UI-gating alone isn't enough:
-- a free holder could hand-craft an API call and read the same owner-readable
-- count views. This RPC makes Pro a HARD entitlement at the data layer — it
-- returns nothing unless the caller is (a) authenticated, (b) a Pro member, and
-- (c) the holder of each event requested.
--
-- The client (src/lib/eventAnalytics.ts → fetchSellerReach) prefers this RPC
-- and only falls back to direct count reads while this migration is unapplied.
-- Once applied, free holders are blocked even outside the UI.
--
-- AGENT NOTE: the agent cannot apply Supabase DDL. Apply this by running the
-- migration or pasting the body below into the Supabase SQL editor.
-- ============================================================================

create or replace function public.fetch_seller_reach(p_event_ids uuid[])
returns table (event_id uuid, views int, saves int, taps int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_pro boolean;
begin
  -- Require an authenticated Pro caller.
  select (membership_tier = 'pro' or coalesce(pro_member, false))
    into v_is_pro
    from public.profiles
   where id = auth.uid();

  if not coalesce(v_is_pro, false) then
    raise exception 'PRO_REQUIRED: reach analytics is a Pro feature'
      using errcode = 'insufficient_privilege';
  end if;

  -- Ownership is enforced in the WHERE clause: only the caller's own events
  -- are returned, regardless of which ids were requested.
  return query
  select e.id as event_id,
         coalesce(vc.view_count, 0)::int as views,
         coalesce(sc.save_count, 0)::int as saves,
         coalesce(cc.taps, 0)::int       as taps
    from public.events e
    left join public.event_view_counts vc on vc.event_id = e.id
    left join public.event_save_counts sc on sc.event_id = e.id
    left join (
      select ecc.event_id, sum(ecc.click_count)::int as taps
        from public.event_click_counts ecc
       group by ecc.event_id
    ) cc on cc.event_id = e.id
   where e.id = any(p_event_ids)
     and e.holder_id = auth.uid();
end;
$$;

revoke all on function public.fetch_seller_reach(uuid[]) from public, anon;
grant execute on function public.fetch_seller_reach(uuid[]) to authenticated;

-- Make the RPC the ONLY read path for reach data. The count views were
-- previously granted SELECT to `authenticated`, which let any logged-in holder
-- pull reach metrics directly via the REST API and bypass the Pro gate. Revoke
-- those direct grants — the SECURITY DEFINER function above runs as its owner
-- and is unaffected, so the Pro dashboard keeps working while the underlying
-- data is no longer free-readable. (Aggregation in the app goes through the RPC;
-- the only other reader, fetchEventEngagement, is currently unused and must be
-- reimplemented as a definer RPC if a per-event card is reintroduced.)
revoke select on public.event_view_counts  from authenticated, anon;
revoke select on public.event_save_counts  from authenticated, anon;
revoke select on public.event_click_counts from authenticated, anon;
