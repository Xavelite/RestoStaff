-- List a restaurant's paired badge devices for the manager UI. A SECURITY
-- DEFINER RPC (owner/manager only) rather than a direct table select, so the
-- restaurant_stations table is never exposed to PostgREST and token_hash never
-- leaves the database.
begin;

create or replace function public.list_restaurant_stations(p_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'label', s.label,
        'created_at', s.created_at,
        'last_used_at', s.last_used_at
      )
      order by s.created_at desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from public.restaurant_stations s
  where s.restaurant_id = p_restaurant_id
    and s.revoked_at is null;
  return jsonb_build_object('stations', v_rows);
end;
$$;

revoke all on function public.list_restaurant_stations(uuid) from public, anon, authenticated;
grant execute on function public.list_restaurant_stations(uuid) to authenticated;

commit;
