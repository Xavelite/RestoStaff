-- Owners and managers share restaurant operations. Branding is operational,
-- not payroll/financial data, so both roles may maintain the restaurant logo.
begin;

drop policy if exists "owners upload their restaurant logo" on storage.objects;
drop policy if exists "owners replace their restaurant logo" on storage.objects;
drop policy if exists "owners remove their restaurant logo" on storage.objects;
drop policy if exists "operators upload their restaurant logo" on storage.objects;
drop policy if exists "operators replace their restaurant logo" on storage.objects;
drop policy if exists "operators remove their restaurant logo" on storage.objects;

create policy "operators upload their restaurant logo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'restaurant-logos'
    and public.is_owner_or_manager(((storage.foldername(name))[1])::uuid)
  );

create policy "operators replace their restaurant logo"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'restaurant-logos'
    and public.is_owner_or_manager(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'restaurant-logos'
    and public.is_owner_or_manager(((storage.foldername(name))[1])::uuid)
  );

create policy "operators remove their restaurant logo"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'restaurant-logos'
    and public.is_owner_or_manager(((storage.foldername(name))[1])::uuid)
  );

create or replace function public.set_restaurant_logo(
  p_restaurant_id uuid,
  p_logo_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
begin
  perform 1
  from public.require_owner_or_manager_context(p_restaurant_id);

  update public.restaurants
     set logo_path = nullif(btrim(coalesce(p_logo_path, '')), ''),
         updated_at = now()
   where id = p_restaurant_id;

  if not found then
    raise exception 'Restaurant not found.';
  end if;

  return jsonb_build_object('ok', true);
end
$function$;

revoke all on function public.set_restaurant_logo(uuid, text)
  from public, anon;
grant execute on function public.set_restaurant_logo(uuid, text)
  to authenticated, service_role;

commit;
