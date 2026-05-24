-- DnD Map Generator schema
-- Run this in the Supabase SQL Editor

create table if not exists maps (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  prompt text not null,
  map_data jsonb not null,
  thumbnail_url text,
  map_type text check (map_type in ('dungeon','overworld','town','interior')),
  width integer default 20,
  height integer default 15,
  created_at timestamp with time zone default now()
);

-- Enable RLS but allow public access (no auth app)
alter table maps enable row level security;

create policy "Public read maps" on maps for select using (true);
create policy "Public insert maps" on maps for insert with check (true);
create policy "Public update maps" on maps for update using (true);
create policy "Public delete maps" on maps for delete using (true);

-- Storage bucket para thumbnails
insert into storage.buckets (id, name, public)
values ('map-thumbnails', 'map-thumbnails', true)
on conflict (id) do nothing;

-- Policies for storage objects
create policy "Public read thumbnails"
  on storage.objects for select
  using (bucket_id = 'map-thumbnails');

create policy "Public insert thumbnails"
  on storage.objects for insert
  with check (bucket_id = 'map-thumbnails');

create policy "Public delete thumbnails"
  on storage.objects for delete
  using (bucket_id = 'map-thumbnails');
