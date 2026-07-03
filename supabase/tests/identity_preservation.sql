-- Capture this result before and after migration 202606190002.
-- Counts and every returned identifier/link must match.
select jsonb_build_object(
  'auth_users', (
    select coalesce(jsonb_agg(
      jsonb_build_object('id', id, 'email', email)
      order by id
    ), '[]'::jsonb)
    from auth.users
  ),
  'profiles', (
    select coalesce(jsonb_agg(
      jsonb_build_object('id', id, 'auth_user_id', auth_user_id, 'email', email)
      order by id
    ), '[]'::jsonb)
    from public.profiles
  ),
  'memberships', (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'restaurant_id', restaurant_id,
        'profile_id', profile_id,
        'role', role,
        'status', status
      )
      order by restaurant_id, profile_id
    ), '[]'::jsonb)
    from public.restaurant_memberships
  ),
  'access_links', (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'restaurant_id', restaurant_id,
        'employee_id', employee_id,
        'profile_id', profile_id,
        'access_status', access_status
      )
      order by restaurant_id, employee_id
    ), '[]'::jsonb)
    from public.employee_access
  )
) as identity_snapshot;
