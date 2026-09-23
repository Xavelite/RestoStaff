begin;

-- Restaurant onboarding is self-service after authentication. The former
-- pilot approval queue remains readable for historical administration, but it
-- no longer controls whether a signed-in owner can create a workspace.
drop trigger if exists enforce_controlled_restaurant_creation on public.restaurants;
drop function if exists public.enforce_controlled_restaurant_creation();

-- Cached clients from the controlled-pilot release still call this RPC before
-- rendering onboarding. Keep that contract compatible while returning the new
-- open state for every authenticated account.
create or replace function public.get_pilot_access_state()
returns jsonb
language sql
stable
security definer
set search_path = public
as $state$
  select jsonb_build_object(
    'status', coalesce((
      select r.status
      from public.pilot_access_requests r
      where r.auth_user_id = auth.uid()
    ), 'not_requested'),
    'requested_at', (
      select r.requested_at
      from public.pilot_access_requests r
      where r.auth_user_id = auth.uid()
    ),
    'reviewed_at', (
      select r.reviewed_at
      from public.pilot_access_requests r
      where r.auth_user_id = auth.uid()
    ),
    'can_create_workspace', auth.uid() is not null
  )
$state$;

revoke all on function public.get_pilot_access_state() from public, anon, authenticated;
grant execute on function public.get_pilot_access_state() to authenticated;

comment on function public.get_pilot_access_state() is
  'Compatibility state for clients released before self-service restaurant onboarding.';

notify pgrst, 'reload schema';

commit;
