-- Shared hero gallery. Run once in the Supabase SQL editor (or: psql "$DATABASE_URL" -f supabase/schema.sql).
-- Only the server writes, with the service-role key. RLS is on with no policies, so the
-- anon key can't touch the table; models and thumbnails are read from the public bucket.

create table if not exists public.heroes (
  seed        text primary key,
  name        text not null,
  archetype   text not null,
  rarity      text not null,
  character   jsonb not null,
  model_path  text not null,
  thumb_path  text,
  created_at  timestamptz not null default now()
);

create index if not exists heroes_created_at_idx on public.heroes (created_at desc);

alter table public.heroes enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('heroes', 'heroes', true, 52428800, array['model/gltf-binary', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
