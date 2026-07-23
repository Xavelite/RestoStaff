-- Platform-owned objects that are outside the public schema dump.

-- Keep schema ownership with Supabase administrative roles. API runtime roles
-- receive object privileges explicitly and only need schema lookup access.
revoke all on schema public from public;
revoke create on schema public from anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'badge-proofs',
  'badge-proofs',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
