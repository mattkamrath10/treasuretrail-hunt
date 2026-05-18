create table if not exists platform_submissions (
  id uuid primary key default gen_random_uuid(),
  platform_name text not null,
  website_url text,
  description text,
  platform_type text not null default 'marketplace',
  shipping_supported boolean not null default false,
  scout_friendly boolean not null default false,
  logo_url text,
  submitted_by uuid references profiles(id) on delete set null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table platform_submissions enable row level security;

create policy "Anyone can submit platforms"
  on platform_submissions for insert
  to authenticated, anon
  with check (true);

create policy "Anyone can read platform submissions"
  on platform_submissions for select
  to authenticated, anon
  using (true);
