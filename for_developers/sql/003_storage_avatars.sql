-- 003 — Supabase Storage bucket for profile avatars (run in Supabase SQL Editor)
-- Files are served from Storage; public URL is saved in profiles.avatar_url.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can read avatar images (URLs are embedded in forum HTML).
drop policy if exists "Public read avatars" on storage.objects;
create policy "Public read avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Uploads are done only by your API using the service role (bypasses RLS).
