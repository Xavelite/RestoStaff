-- A restaurant can show its own logo on the surfaces its staff and guests see:
-- the badge terminal and the paired station screen. The RestoGoGo mark stays in
-- the manager topbar, which belongs to the product rather than to one tenant.
--
-- Unlike badge proofs, a logo is not private: it is displayed on a wall-mounted
-- terminal all service. The bucket is therefore public and cacheable, and the
-- limits are tight because it is only ever drawn small.
begin;

alter table public.restaurants
  add column if not exists logo_path text;

comment on column public.restaurants.logo_path is
  'Object path inside the public restaurant-logos bucket, or null when the restaurant uses no logo.';

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'restaurant-logos',
  'restaurant-logos',
  true,
  1048576,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Objects live under <restaurant_id>/..., so the first path segment decides who
-- may write. Reads are public; only an active owner of that restaurant writes.
drop policy if exists "restaurant logos are publicly readable" on storage.objects;
create policy "restaurant logos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'restaurant-logos');

drop policy if exists "owners upload their restaurant logo" on storage.objects;
create policy "owners upload their restaurant logo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'restaurant-logos'
    and public.is_owner(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "owners replace their restaurant logo" on storage.objects;
create policy "owners replace their restaurant logo"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'restaurant-logos'
    and public.is_owner(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "owners remove their restaurant logo" on storage.objects;
create policy "owners remove their restaurant logo"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'restaurant-logos'
    and public.is_owner(((storage.foldername(name))[1])::uuid)
  );

-- Recording the path is its own small RPC rather than another field threaded
-- through save_restaurant: uploading is a separate act from editing the
-- blueprint, and this keeps the large save function untouched.
create or replace function public.set_restaurant_logo(
  p_restaurant_id uuid,
  p_logo_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can change the restaurant logo.';
  end if;

  update public.restaurants
     set logo_path = nullif(btrim(coalesce(p_logo_path, '')), ''),
         updated_at = now()
   where id = p_restaurant_id;

  if not found then
    raise exception 'Restaurant not found.';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.set_restaurant_logo(uuid, text) from public, anon;
grant execute on function public.set_restaurant_logo(uuid, text) to authenticated;

commit;
