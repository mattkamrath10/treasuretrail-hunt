-- Phase 3 — Wanted Items
-- Demand-signal posts: "I'm looking for X". Distinct from listings
-- (sellers offering) and finds (showcase). Sellers/scouts can search
-- this table to know what buyers want and respond with a marketplace
-- listing or DM.

create table if not exists public.wanted_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null check (char_length(title) between 2 and 120),
  description  text default '' check (char_length(description) <= 2000),
  category     text not null default 'other'
               check (category in (
                 'collectibles','furniture','electronics','vintage','cards',
                 'jewelry','art','fashion','toys','tools','books','music',
                 'sports','home','other'
               )),
  max_budget   numeric(10,2) check (max_budget is null or max_budget >= 0),
  city         text,
  region       text,
  image_url    text,
  thumb_url    text,
  status       text not null default 'open'
               check (status in ('open','fulfilled','closed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists wanted_items_status_created_idx
  on public.wanted_items (status, created_at desc);
create index if not exists wanted_items_user_idx
  on public.wanted_items (user_id, created_at desc);
create index if not exists wanted_items_category_idx
  on public.wanted_items (category, created_at desc);

-- updated_at trigger
create or replace function public.touch_wanted_items_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists wanted_items_touch_updated_at on public.wanted_items;
create trigger wanted_items_touch_updated_at
  before update on public.wanted_items
  for each row execute function public.touch_wanted_items_updated_at();

-- RLS
alter table public.wanted_items enable row level security;

-- Public read of OPEN posts. Closed/fulfilled stay visible only to owner.
drop policy if exists wanted_items_read_open on public.wanted_items;
create policy wanted_items_read_open on public.wanted_items
  for select using (status = 'open' or auth.uid() = user_id);

drop policy if exists wanted_items_insert_own on public.wanted_items;
create policy wanted_items_insert_own on public.wanted_items
  for insert with check (auth.uid() = user_id);

drop policy if exists wanted_items_update_own on public.wanted_items;
create policy wanted_items_update_own on public.wanted_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists wanted_items_delete_own on public.wanted_items;
create policy wanted_items_delete_own on public.wanted_items
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.wanted_items to authenticated;
grant select on public.wanted_items to anon;
