-- Operational Restaurant setup and optional reservation floor plans now have
-- separate revisioned RPCs. Keep the former combined save available only for
-- trusted maintenance while existing reservation data is migrated.
begin;

revoke all on function public.save_venue_model_v2(
  uuid,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,integer
) from public, anon, authenticated;

grant execute on function public.save_venue_model_v2(
  uuid,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,integer
) to service_role;

comment on function public.save_venue_model_v2(
  uuid,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,integer
) is
  'Service-only compatibility save. Browser clients use save_restaurant_model_v3 and entitlement-gated reservation floor-plan RPCs.';

notify pgrst, 'reload schema';
commit;
