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

alter table realtime.messages enable row level security;

drop policy if exists "workspace members can receive broadcasts" on realtime.messages;
create policy "workspace members can receive broadcasts"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and case
    when (select realtime.topic()) ~ '^workspace:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_restaurant_member(substring((select realtime.topic()) from 11)::uuid)
    else false
  end
);

drop policy if exists "workspace members can send broadcasts" on realtime.messages;
create policy "workspace members can send broadcasts"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and case
    when (select realtime.topic()) ~ '^workspace:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_restaurant_member(substring((select realtime.topic()) from 11)::uuid)
    else false
  end
);
