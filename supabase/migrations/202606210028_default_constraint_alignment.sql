-- Phase 3 follow-up: align two column defaults with their tightened CHECKs.
--
-- Migration 202606210020 narrowed employee_access.access_status and
-- restaurant_memberships.status to ('active','disabled') and migrated existing
-- rows, but left the original column DEFAULTs ('temporary' and 'invited'),
-- which now fall outside their own CHECK sets. Every current writer sets the
-- value explicitly, so no live insert hits the default; this realigns the
-- defaults so any future or manual insert cannot violate the constraint.
--
-- Preconditions:
-- - Migration 202606210027 is applied.
-- - employee_access_status_check and restaurant_memberships_status_check
--   constrain their columns to ('active','disabled').
--
-- Rollback:
-- - Restore the prior defaults:
--     alter table public.employee_access
--       alter column access_status set default 'temporary'::text;
--     alter table public.restaurant_memberships
--       alter column status set default 'invited'::text;
-- - No rows, constraints, signatures or grants change.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $default_constraint_preconditions$
declare
  v_access_check text;
  v_membership_check text;
begin
  select pg_get_constraintdef(c.oid)
  into v_access_check
  from pg_constraint c
  where c.conrelid = 'public.employee_access'::regclass
    and c.conname = 'employee_access_status_check';

  select pg_get_constraintdef(c.oid)
  into v_membership_check
  from pg_constraint c
  where c.conrelid = 'public.restaurant_memberships'::regclass
    and c.conname = 'restaurant_memberships_status_check';

  if v_access_check is null
      or position('active' in v_access_check) = 0
      or position('disabled' in v_access_check) = 0
      or position('temporary' in v_access_check) > 0 then
    raise exception
      'employee_access status contract is not the reviewed Phase 3 shape.';
  end if;
  if v_membership_check is null
      or position('active' in v_membership_check) = 0
      or position('disabled' in v_membership_check) = 0
      or position('invited' in v_membership_check) > 0 then
    raise exception
      'restaurant_memberships status contract is not the reviewed Phase 3 shape.';
  end if;
end
$default_constraint_preconditions$;

alter table public.employee_access
  alter column access_status set default 'disabled'::text;

alter table public.restaurant_memberships
  alter column status set default 'disabled'::text;

do $default_constraint_alignment$
declare
  v_access_default text := pg_get_expr(
    (
      select d.adbin
      from pg_attrdef d
      join pg_attribute a
        on a.attrelid = d.adrelid and a.attnum = d.adnum
      where d.adrelid = 'public.employee_access'::regclass
        and a.attname = 'access_status'
    ),
    'public.employee_access'::regclass
  );
  v_status_default text := pg_get_expr(
    (
      select d.adbin
      from pg_attrdef d
      join pg_attribute a
        on a.attrelid = d.adrelid and a.attnum = d.adnum
      where d.adrelid = 'public.restaurant_memberships'::regclass
        and a.attname = 'status'
    ),
    'public.restaurant_memberships'::regclass
  );
begin
  if v_access_default <> '''disabled''::text' then
    raise exception
      'employee_access.access_status default not aligned: %', v_access_default;
  end if;
  if v_status_default <> '''disabled''::text' then
    raise exception
      'restaurant_memberships.status default not aligned: %', v_status_default;
  end if;
end
$default_constraint_alignment$;

commit;
