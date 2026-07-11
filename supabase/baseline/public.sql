SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "postgres";


CREATE TYPE "public"."actuals_status" AS ENUM (
    'open',
    'approved',
    'locked'
);


ALTER TYPE "public"."actuals_status" OWNER TO "postgres";


CREATE TYPE "public"."availability_submission_status" AS ENUM (
    'draft',
    'submitted'
);


ALTER TYPE "public"."availability_submission_status" OWNER TO "postgres";


CREATE TYPE "public"."operational_request_status" AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled'
);


ALTER TYPE "public"."operational_request_status" OWNER TO "postgres";


CREATE TYPE "public"."planned_shift_source" AS ENUM (
    'manual',
    'copied',
    'template'
);


ALTER TYPE "public"."planned_shift_source" OWNER TO "postgres";


CREATE TYPE "public"."planning_status" AS ENUM (
    'draft',
    'published'
);


ALTER TYPE "public"."planning_status" OWNER TO "postgres";


CREATE TYPE "public"."service_availability_state" AS ENUM (
    'available',
    'partial',
    'unavailable'
);


ALTER TYPE "public"."service_availability_state" OWNER TO "postgres";


CREATE TYPE "public"."time_entry_source" AS ENUM (
    'badge_terminal',
    'manager_manual'
);


ALTER TYPE "public"."time_entry_source" OWNER TO "postgres";


CREATE TYPE "public"."time_entry_status" AS ENUM (
    'open',
    'closed',
    'adjusted',
    'cancelled'
);


ALTER TYPE "public"."time_entry_status" OWNER TO "postgres";


CREATE TYPE "public"."work_regime" AS ENUM (
    'fixed_schedule',
    'weekly_availability',
    'manager_only'
);


ALTER TYPE "public"."work_regime" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_employee_invite"("p_restaurant_id" "uuid", "p_invitation_token" "text", "p_pin" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_auth_user_id uuid := auth.uid();
  v_auth_email citext := lower(btrim(coalesce(auth.jwt()->>'email', '')))::citext;
  v_invitation public.employee_invitations%rowtype;
  v_employee public.employees%rowtype;
  v_profile public.profiles%rowtype;
  v_existing_auth_user_id uuid;
  v_role text;
begin
  if v_auth_user_id is null or v_auth_email::text = '' then
    raise exception 'Sign in with the invited email account.';
  end if;
  if btrim(coalesce(p_invitation_token, '')) = '' then
    raise exception 'Invitation token is missing.';
  end if;
  if btrim(coalesce(p_pin, '')) !~ '^[0-9]{4}$' then
    raise exception 'Enter a four-digit badge PIN.';
  end if;

  update public.employee_invitations
  set status = 'expired',
      updated_at = now()
  where status = 'pending'
    and expires_at <= now();

  select * into v_invitation
  from public.employee_invitations i
  where i.restaurant_id = p_restaurant_id
    and i.token_hash = encode(
      extensions.digest(p_invitation_token, 'sha256'),
      'hex'
    )
    and i.status = 'pending'
    and i.expires_at > now()
  limit 1
  for update;

  if v_invitation.id is null then
    raise exception 'Invitation is invalid, expired or has already been used.';
  end if;
  if lower(v_invitation.email::text) <> lower(v_auth_email::text) then
    raise exception 'Sign in with the email address that received this invitation.';
  end if;

  select * into v_employee
  from public.employees e
  where e.restaurant_id = p_restaurant_id
    and e.id = v_invitation.employee_id
    and e.active
  for update;
  if v_employee.id is null then
    raise exception 'The invited employee is no longer active.';
  end if;

  select * into v_profile
  from public.profiles p
  where p.auth_user_id = v_auth_user_id
  limit 1
  for update;

  if v_profile.id is null then
    select * into v_profile
    from public.profiles p
    where lower(p.email::text) = lower(v_auth_email::text)
    limit 1
    for update;

    if v_profile.id is not null then
      v_existing_auth_user_id := v_profile.auth_user_id;
      if v_existing_auth_user_id is not null
          and v_existing_auth_user_id <> v_auth_user_id then
        raise exception 'This email is already linked to another account.';
      end if;
      update public.profiles
      set auth_user_id = v_auth_user_id,
          email = v_auth_email,
          first_name = coalesce(first_name, v_employee.first_name),
          last_name = coalesce(last_name, v_employee.last_name),
          updated_at = now()
      where id = v_profile.id
      returning * into v_profile;
    else
      insert into public.profiles (
        auth_user_id, email, first_name, last_name
      )
      values (
        v_auth_user_id,
        v_auth_email,
        v_employee.first_name,
        v_employee.last_name
      )
      returning * into v_profile;
    end if;
  elsif lower(v_profile.email::text) <> lower(v_auth_email::text) then
    if exists (
      select 1 from public.profiles p
      where lower(p.email::text) = lower(v_auth_email::text)
        and p.id <> v_profile.id
    ) then
      raise exception 'This email is already linked to another profile.';
    end if;
    update public.profiles
    set email = v_auth_email,
        updated_at = now()
    where id = v_profile.id
    returning * into v_profile;
  end if;

  if exists (
    select 1
    from public.employee_access ea
    where ea.restaurant_id = p_restaurant_id
      and ea.profile_id = v_profile.id
      and ea.employee_id <> v_invitation.employee_id
  ) then
    raise exception 'This account is already linked to another employee in the restaurant.';
  end if;

  insert into public.restaurant_memberships (
    restaurant_id, profile_id, role, status
  )
  values (
    p_restaurant_id, v_profile.id, v_invitation.invited_role, 'active'
  )
  on conflict (restaurant_id, profile_id) do update set
    role = case
      when restaurant_memberships.role = 'owner' then 'owner'
      when restaurant_memberships.role = 'manager' then 'manager'
      else excluded.role
    end,
    status = 'active',
    updated_at = now();

  insert into public.employee_access (
    restaurant_id,
    employee_id,
    profile_id,
    access_status,
    badge_enabled
  )
  values (
    p_restaurant_id,
    v_invitation.employee_id,
    v_profile.id,
    'active',
    true
  )
  on conflict (restaurant_id, employee_id) do update set
    profile_id = excluded.profile_id,
    access_status = 'active',
    updated_at = now();

  insert into public.employee_pin_credentials (
    restaurant_id,
    employee_id,
    pin_hash,
    pin_status,
    failed_attempts,
    locked_until,
    last_rotated_at
  )
  values (
    p_restaurant_id,
    v_invitation.employee_id,
    public.crypt(btrim(p_pin), public.gen_salt('bf')),
    'active',
    0,
    null,
    now()
  )
  on conflict (restaurant_id, employee_id) do update set
    pin_hash = excluded.pin_hash,
    pin_status = 'active',
    failed_attempts = 0,
    locked_until = null,
    last_rotated_at = now(),
    updated_at = now();

  update public.employee_invitations
  set status = 'accepted',
      accepted_at = now(),
      accepted_by_profile_id = v_profile.id,
      updated_at = now()
  where id = v_invitation.id;

  select m.role into v_role
  from public.restaurant_memberships m
  where m.restaurant_id = p_restaurant_id
    and m.profile_id = v_profile.id;

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id,
    'employee_id', v_invitation.employee_id,
    'role', v_role
  );
end
$_$;


ALTER FUNCTION "public"."accept_employee_invite"("p_restaurant_id" "uuid", "p_invitation_token" "text", "p_pin" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."active_membership_role"("p_restaurant_id" "uuid", "p_profile_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select m.role::text
  from public.restaurant_memberships m
  where m.restaurant_id = p_restaurant_id
    and m.profile_id = p_profile_id
    and m.status = 'active'
    and m.role in ('owner', 'manager')
  limit 1
$$;


ALTER FUNCTION "public"."active_membership_role"("p_restaurant_id" "uuid", "p_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."actuals_snapshot_for_week"("p_restaurant_id" "uuid", "p_week_start" "date") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'entries',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', t.id,
            'revision', t.revision,
            'employee_id', t.employee_id,
            'business_date', t.business_date,
            'service_key', t.service_key,
            'planned_shift_id', t.planned_shift_id,
            'clock_in_at', t.clock_in_at,
            'clock_out_at', t.clock_out_at,
            'break_minutes', t.break_minutes,
            'source', t.source,
            'status', t.status,
            'adjusted_at', t.adjusted_at,
            'adjustment_reason', t.adjustment_reason,
            'cancelled_at', t.cancelled_at,
            'cancellation_reason', t.cancellation_reason
          )
          order by t.business_date, t.service_key, t.employee_id, t.created_at
        )
        from public.time_entries t
        where t.restaurant_id = p_restaurant_id
          and t.business_date between p_week_start and p_week_start + 6
      ),
      '[]'::jsonb
    ),
    'entry_count',
    (
      select count(*)
      from public.time_entries t
      where t.restaurant_id = p_restaurant_id
        and t.business_date between p_week_start and p_week_start + 6
        and t.status <> 'cancelled'
    ),
    'worked_minutes',
    coalesce(
      (
        select sum(
          greatest(
            0,
            extract(epoch from (t.clock_out_at - t.clock_in_at)) / 60
              - t.break_minutes
          )
        )::bigint
        from public.time_entries t
        where t.restaurant_id = p_restaurant_id
          and t.business_date between p_week_start and p_week_start + 6
          and t.status in ('closed', 'adjusted')
      ),
      0
    )
  )
$$;


ALTER FUNCTION "public"."actuals_snapshot_for_week"("p_restaurant_id" "uuid", "p_week_start" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."advance_time_entry_revision"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'UPDATE' then
    if new.restaurant_id is distinct from old.restaurant_id
        or new.employee_id is distinct from old.employee_id
        or new.business_date is distinct from old.business_date
        or new.service_key is distinct from old.service_key then
      raise exception 'Time-entry identity fields cannot be changed.';
    end if;
    new.revision := old.revision + 1;
  end if;
  return new;
end
$$;


ALTER FUNCTION "public"."advance_time_entry_revision"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."badge_photo_status_to_db"("p_status" "text", "p_photo_url" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select case lower(replace(trim(coalesce(p_status, '')), '-', '_'))
    when 'ok'           then 'captured'     -- browser status alias
    when 'captured'     then 'captured'
    when 'blocked'      then 'denied'       -- browser status alias
    when 'denied'       then 'denied'
    when 'unsupported'  then 'unavailable'  -- browser status alias
    when 'not_available' then 'unavailable'
    when 'unavailable'  then 'unavailable'
    when 'error'        then 'failed'       -- browser status alias
    when 'failed'       then 'failed'
    when 'skipped'      then 'waived'       -- browser status alias
    when 'waived'       then 'waived'
    when 'not_required' then 'not_required'
    when 'missing'      then 'missing'
    else case when nullif(trim(coalesce(p_photo_url, '')), '') is null then 'missing' else 'captured' end
  end;
$$;


ALTER FUNCTION "public"."badge_photo_status_to_db"("p_status" "text", "p_photo_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."build_employee_operations_read_model"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_from_date" "date", "p_to_date" "date") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'restaurant', to_jsonb(r),
    'restaurant_settings', coalesce((select to_jsonb(s) from public.restaurant_settings s where s.restaurant_id = r.id), '{}'::jsonb),
    'employees', coalesce((select jsonb_agg(to_jsonb(e)) from public.employees e where e.restaurant_id = r.id and e.id = p_employee_id), '[]'::jsonb),
    'employee_contracts', coalesce((select jsonb_agg(to_jsonb(c)) from public.employee_contracts c where c.restaurant_id = r.id and c.employee_id = p_employee_id), '[]'::jsonb),
    'job_functions', coalesce((select jsonb_agg(to_jsonb(j) order by j.sort_order, j.name) from public.job_functions j where j.restaurant_id = r.id), '[]'::jsonb),
    'employee_job_functions', coalesce((select jsonb_agg(to_jsonb(ej)) from public.employee_job_functions ej where ej.restaurant_id = r.id and ej.employee_id = p_employee_id), '[]'::jsonb),
    'recurring_schedule_slots', coalesce((select jsonb_agg(to_jsonb(rs)) from public.recurring_schedule_slots rs where rs.restaurant_id = r.id and rs.employee_id = p_employee_id), '[]'::jsonb),
    'contract_types', coalesce((select jsonb_agg(to_jsonb(ct) order by ct.sort_order) from public.contract_types ct where ct.restaurant_id = r.id and ct.active), '[]'::jsonb),
    'work_areas', coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_order, a.name) from public.work_areas a where a.restaurant_id = r.id), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order) from public.services s where s.restaurant_id = r.id), '[]'::jsonb),
    'absence_types', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order) from public.absence_types t where t.restaurant_id = r.id and t.active), '[]'::jsonb),
    'work_weeks', coalesce((select jsonb_agg(to_jsonb(w)) from public.work_weeks w where w.restaurant_id = r.id and w.week_start >= public.week_start_for_date(p_from_date) and w.week_start <= public.week_start_for_date(p_to_date)), '[]'::jsonb),
    'planned_shifts', coalesce((select jsonb_agg(to_jsonb(p)) from public.planned_shifts p join public.work_weeks w on w.restaurant_id = p.restaurant_id and w.week_start = p.week_start where p.restaurant_id = r.id and p.employee_id = p_employee_id and w.planning_status = 'published' and p.week_start + (p.weekday - 1) between p_from_date and p_to_date), '[]'::jsonb),
    'employee_availability_slots', coalesce((select jsonb_agg(to_jsonb(a)) from public.employee_availability_slots a where a.restaurant_id = r.id and a.employee_id = p_employee_id and a.week_start + (a.weekday - 1) between p_from_date and p_to_date), '[]'::jsonb),
    'employee_availability_submissions', coalesce((select jsonb_agg(to_jsonb(s)) from public.employee_availability_submissions s where s.restaurant_id = r.id and s.employee_id = p_employee_id and s.week_start between public.week_start_for_date(p_from_date) and public.week_start_for_date(p_to_date)), '[]'::jsonb),
    'time_entries', coalesce((select jsonb_agg(to_jsonb(t)) from public.time_entries t where t.restaurant_id = r.id and t.employee_id = p_employee_id and t.business_date between p_from_date and p_to_date), '[]'::jsonb),
    'absences', coalesce((select jsonb_agg(to_jsonb(a)) from public.absences a where a.restaurant_id = r.id and a.employee_id = p_employee_id and a.start_date <= p_to_date and a.end_date >= p_from_date), '[]'::jsonb),
    'work_pattern_exceptions', coalesce((select jsonb_agg(to_jsonb(x)) from public.work_pattern_exceptions x where x.restaurant_id = r.id and x.employee_id = p_employee_id and x.start_date <= p_to_date and x.end_date >= p_from_date), '[]'::jsonb)
  )
  from public.restaurants r
  where r.id = p_restaurant_id
$$;


ALTER FUNCTION "public"."build_employee_operations_read_model"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_from_date" "date", "p_to_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."build_manager_operations_read_model"("p_restaurant_id" "uuid", "p_role" "text", "p_from_date" "date", "p_to_date" "date") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'restaurant', to_jsonb(r),
    'restaurant_settings', coalesce((select to_jsonb(s) from public.restaurant_settings s where s.restaurant_id = r.id), '{}'::jsonb),
    'employees', coalesce((select jsonb_agg(to_jsonb(e) order by e.sort_order, e.display_name) from public.employees e where e.restaurant_id = r.id), '[]'::jsonb),
    'employee_contracts', coalesce((select jsonb_agg(to_jsonb(c)) from public.employee_contracts c where c.restaurant_id = r.id), '[]'::jsonb),
    'employee_legal_profiles', case when p_role = 'owner' then coalesce((select jsonb_agg(to_jsonb(l)) from public.employee_legal_profiles l where l.restaurant_id = r.id), '[]'::jsonb) else '[]'::jsonb end,
    'employee_payroll_profiles', case when p_role = 'owner' then coalesce((select jsonb_agg(to_jsonb(p)) from public.employee_payroll_profiles p where p.restaurant_id = r.id), '[]'::jsonb) else '[]'::jsonb end,
    'job_functions', coalesce((select jsonb_agg(to_jsonb(j) order by j.sort_order, j.name) from public.job_functions j where j.restaurant_id = r.id), '[]'::jsonb),
    'employee_job_functions', coalesce((select jsonb_agg(to_jsonb(ej)) from public.employee_job_functions ej where ej.restaurant_id = r.id), '[]'::jsonb),
    'recurring_schedule_slots', coalesce((select jsonb_agg(to_jsonb(rs)) from public.recurring_schedule_slots rs where rs.restaurant_id = r.id), '[]'::jsonb),
    'contract_types', coalesce((select jsonb_agg(to_jsonb(ct) order by ct.sort_order) from public.contract_types ct where ct.restaurant_id = r.id and ct.active), '[]'::jsonb),
    'work_areas', coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_order, a.name) from public.work_areas a where a.restaurant_id = r.id), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order) from public.services s where s.restaurant_id = r.id), '[]'::jsonb),
    'area_service_defaults', coalesce((select jsonb_agg(to_jsonb(d)) from public.area_service_defaults d where d.restaurant_id = r.id), '[]'::jsonb),
    'coverage_requirements', coalesce((select jsonb_agg(to_jsonb(c)) from public.coverage_requirements c where c.restaurant_id = r.id), '[]'::jsonb),
    'opening_hours', coalesce((select jsonb_agg(to_jsonb(h)) from public.opening_hours h where h.restaurant_id = r.id), '[]'::jsonb),
    'absence_types', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order) from public.absence_types t where t.restaurant_id = r.id and t.active), '[]'::jsonb),
    'work_weeks', coalesce((select jsonb_agg(to_jsonb(w)) from public.work_weeks w where w.restaurant_id = r.id and w.week_start >= public.week_start_for_date(p_from_date) and w.week_start <= public.week_start_for_date(p_to_date)), '[]'::jsonb),
    'work_week_events', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.work_week_events e where e.restaurant_id = r.id and e.week_start >= public.week_start_for_date(p_from_date) and e.week_start <= public.week_start_for_date(p_to_date)), '[]'::jsonb),
    'planned_shifts', coalesce((select jsonb_agg(to_jsonb(p)) from public.planned_shifts p where p.restaurant_id = r.id and p.week_start + (p.weekday - 1) between p_from_date and p_to_date), '[]'::jsonb),
    'employee_availability_slots', coalesce((select jsonb_agg(to_jsonb(a)) from public.employee_availability_slots a where a.restaurant_id = r.id and a.week_start + (a.weekday - 1) between p_from_date and p_to_date), '[]'::jsonb),
    'employee_availability_submissions', coalesce((select jsonb_agg(to_jsonb(s)) from public.employee_availability_submissions s where s.restaurant_id = r.id and s.week_start between public.week_start_for_date(p_from_date) and public.week_start_for_date(p_to_date)), '[]'::jsonb),
    'weekly_notes', coalesce((select jsonb_agg(to_jsonb(n)) from public.weekly_notes n where n.restaurant_id = r.id and n.week_start + (n.weekday - 1) between p_from_date and p_to_date), '[]'::jsonb),
    'time_entries', coalesce((select jsonb_agg(to_jsonb(t)) from public.time_entries t where t.restaurant_id = r.id and t.business_date between p_from_date and p_to_date), '[]'::jsonb),
    'time_entry_adjustments', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.time_entry_adjustments a where a.restaurant_id = r.id and a.business_date between p_from_date and p_to_date), '[]'::jsonb),
    'absences', coalesce((select jsonb_agg(to_jsonb(a)) from public.absences a where a.restaurant_id = r.id and a.start_date <= p_to_date and a.end_date >= p_from_date), '[]'::jsonb),
    'absence_events', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.absence_events e join public.absences a on a.id = e.absence_id and a.restaurant_id = e.restaurant_id where e.restaurant_id = r.id and a.start_date <= p_to_date and a.end_date >= p_from_date), '[]'::jsonb),
    'work_pattern_exceptions', coalesce((select jsonb_agg(to_jsonb(x)) from public.work_pattern_exceptions x where x.restaurant_id = r.id and x.start_date <= p_to_date and x.end_date >= p_from_date), '[]'::jsonb),
    'payroll_export_runs', case when p_role = 'owner' then public.payroll_export_run_summaries(p_restaurant_id, p_from_date, p_to_date) else '[]'::jsonb end,
    'work_pattern_exception_events', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.work_pattern_exception_events e join public.work_pattern_exceptions x on x.id = e.work_pattern_exception_id and x.restaurant_id = e.restaurant_id where e.restaurant_id = r.id and x.start_date <= p_to_date and x.end_date >= p_from_date), '[]'::jsonb)
  )
  from public.restaurants r
  where r.id = p_restaurant_id
$$;


ALTER FUNCTION "public"."build_manager_operations_read_model"("p_restaurant_id" "uuid", "p_role" "text", "p_from_date" "date", "p_to_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."build_restaurant_read_model"("p_restaurant_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'restaurant', to_jsonb(r),
    'restaurant_settings', coalesce((select to_jsonb(s) from public.restaurant_settings s where s.restaurant_id = r.id), '{}'::jsonb),
    'restaurant_onboarding_state', coalesce((select to_jsonb(o) from public.restaurant_onboarding_state o where o.restaurant_id = r.id), '{}'::jsonb),
    'job_functions', coalesce((select jsonb_agg(to_jsonb(j) order by j.sort_order, j.name) from public.job_functions j where j.restaurant_id = r.id), '[]'::jsonb),
    'work_areas', coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_order, a.name) from public.work_areas a where a.restaurant_id = r.id), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order) from public.services s where s.restaurant_id = r.id), '[]'::jsonb),
    'area_service_defaults', coalesce((select jsonb_agg(to_jsonb(d)) from public.area_service_defaults d where d.restaurant_id = r.id), '[]'::jsonb),
    'coverage_requirements', coalesce((select jsonb_agg(to_jsonb(c)) from public.coverage_requirements c where c.restaurant_id = r.id), '[]'::jsonb),
    'opening_hours', coalesce((select jsonb_agg(to_jsonb(h)) from public.opening_hours h where h.restaurant_id = r.id), '[]'::jsonb),
    'absence_types', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order) from public.absence_types t where t.restaurant_id = r.id and t.active), '[]'::jsonb)
  )
  from public.restaurants r
  where r.id = p_restaurant_id
$$;


ALTER FUNCTION "public"."build_restaurant_read_model"("p_restaurant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."build_team_read_model"("p_restaurant_id" "uuid", "p_role" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'restaurant', to_jsonb(r),
    'restaurant_settings', coalesce((select to_jsonb(s) from public.restaurant_settings s where s.restaurant_id = r.id), '{}'::jsonb),
    'restaurant_memberships', coalesce((select jsonb_agg(to_jsonb(m)) from public.restaurant_memberships m where m.restaurant_id = r.id), '[]'::jsonb),
    'employees', coalesce((select jsonb_agg(to_jsonb(e) order by e.sort_order, e.display_name) from public.employees e where e.restaurant_id = r.id), '[]'::jsonb),
    'employee_access', coalesce((select jsonb_agg(to_jsonb(a)) from public.employee_access a where a.restaurant_id = r.id), '[]'::jsonb),
    'employee_invitation_states', public.employee_invitation_states_for_restaurant(r.id),
    'employee_pin_credentials', coalesce((select jsonb_agg(jsonb_build_object('restaurant_id', p.restaurant_id, 'employee_id', p.employee_id, 'pin_status', p.pin_status, 'locked_until', p.locked_until, 'last_used_at', p.last_used_at, 'last_rotated_at', p.last_rotated_at)) from public.employee_pin_credentials p where p.restaurant_id = r.id), '[]'::jsonb),
    'employee_contact_details', coalesce((select jsonb_agg(to_jsonb(c)) from public.employee_contact_details c where c.restaurant_id = r.id), '[]'::jsonb),
    'employee_contracts', coalesce((select jsonb_agg(to_jsonb(c)) from public.employee_contracts c where c.restaurant_id = r.id), '[]'::jsonb),
    'employee_legal_profiles', case when p_role = 'owner' then coalesce((select jsonb_agg(to_jsonb(l)) from public.employee_legal_profiles l where l.restaurant_id = r.id), '[]'::jsonb) else '[]'::jsonb end,
    'employee_payroll_profiles', case when p_role = 'owner' then coalesce((select jsonb_agg(to_jsonb(p)) from public.employee_payroll_profiles p where p.restaurant_id = r.id), '[]'::jsonb) else '[]'::jsonb end,
    'job_functions', coalesce((select jsonb_agg(to_jsonb(j) order by j.sort_order, j.name) from public.job_functions j where j.restaurant_id = r.id), '[]'::jsonb),
    'employee_job_functions', coalesce((select jsonb_agg(to_jsonb(ej)) from public.employee_job_functions ej where ej.restaurant_id = r.id), '[]'::jsonb),
    'recurring_schedule_slots', coalesce((select jsonb_agg(to_jsonb(rs)) from public.recurring_schedule_slots rs where rs.restaurant_id = r.id), '[]'::jsonb),
    'contract_types', coalesce((select jsonb_agg(to_jsonb(ct) order by ct.sort_order) from public.contract_types ct where ct.restaurant_id = r.id and ct.active), '[]'::jsonb),
    'absence_types', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order) from public.absence_types t where t.restaurant_id = r.id and t.active), '[]'::jsonb),
    'absences', coalesce((select jsonb_agg(to_jsonb(a)) from public.absences a where a.restaurant_id = r.id), '[]'::jsonb),
    'absence_events', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.absence_events e where e.restaurant_id = r.id), '[]'::jsonb),
    'work_pattern_exceptions', coalesce((select jsonb_agg(to_jsonb(x)) from public.work_pattern_exceptions x where x.restaurant_id = r.id), '[]'::jsonb),
    'work_pattern_exception_events', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.work_pattern_exception_events e where e.restaurant_id = r.id), '[]'::jsonb)
  )
  from public.restaurants r
  where r.id = p_restaurant_id
$$;


ALTER FUNCTION "public"."build_team_read_model"("p_restaurant_id" "uuid", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."build_workspace_bootstrap_read_model"("p_restaurant_id" "uuid", "p_employee_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'restaurant', to_jsonb(r),
    'restaurant_settings', coalesce(
      (
        select to_jsonb(s)
        from public.restaurant_settings s
        where s.restaurant_id = r.id
      ),
      '{}'::jsonb
    ),
    'current_employee', coalesce(
      (
        select to_jsonb(e)
        from public.employees e
        where e.restaurant_id = r.id
          and e.id = p_employee_id
      ),
      'null'::jsonb
    ),
    'readiness', jsonb_build_object(
      'has_active_employees', exists (
        select 1 from public.employees e
        where e.restaurant_id = r.id and e.active
      ),
      'has_active_areas', exists (
        select 1 from public.work_areas a
        where a.restaurant_id = r.id and a.active
      ),
      'has_active_job_functions', exists (
        select 1 from public.job_functions j
        where j.restaurant_id = r.id and j.active
      ),
      'has_open_services', exists (
        select 1 from public.opening_hours h
        where h.restaurant_id = r.id and h.is_open
      ),
      'has_coverage_rules', exists (
        select 1 from public.coverage_requirements c
        where c.restaurant_id = r.id and c.active
      ),
      'has_absence_policy', exists (
        select 1 from public.absence_types a
        where a.restaurant_id = r.id and a.active
      )
    )
  )
  from public.restaurants r
  where r.id = p_restaurant_id
$$;


ALTER FUNCTION "public"."build_workspace_bootstrap_read_model"("p_restaurant_id" "uuid", "p_employee_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bump_actuals_revision_for_entry"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_restaurant_id uuid := case when tg_op = 'DELETE' then old.restaurant_id else new.restaurant_id end;
  v_business_date date := case when tg_op = 'DELETE' then old.business_date else new.business_date end;
begin
  insert into public.work_weeks (
    restaurant_id,
    week_start,
    planning_status,
    actuals_status,
    actuals_revision
  )
  values (
    v_restaurant_id,
    public.week_start_for_date(v_business_date),
    'draft',
    'open',
    1
  )
  on conflict (restaurant_id, week_start) do update set
    actuals_revision = public.work_weeks.actuals_revision + 1,
    updated_at = now();
  return null;
end
$$;


ALTER FUNCTION "public"."bump_actuals_revision_for_entry"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."capture_owner_of_record"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.role = 'owner' then
    update public.restaurants
    set owner_profile_id = new.profile_id
    where id = new.restaurant_id and owner_profile_id is null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."capture_owner_of_record"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_owner_onboarding_draft"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  delete from public.owner_onboarding_drafts where auth_user_id = auth.uid();
  return jsonb_build_object('ok', true);
end;
$$;


ALTER FUNCTION "public"."clear_owner_onboarding_draft"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_payroll_export_run"("p_restaurant_id" "uuid", "p_period_start" "date", "p_period_end" "date", "p_columns" "jsonb" DEFAULT NULL::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_run_id uuid := gen_random_uuid();
  v_timezone text;
  v_week_count integer;
  v_approved_count integer;
  v_columns jsonb;
  v_require_nrn boolean;
  v_headers jsonb;
  v_rows jsonb;
  v_sources jsonb;
  v_payload jsonb;
  v_row_count integer;
  v_total_minutes integer;
  v_filename text;
  v_sha256 text;
  v_missing text;
begin
  if v_profile_id is null then
    raise exception 'Authenticated session required.';
  end if;
  if not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can create a payroll export.';
  end if;
  if p_period_start is null
      or p_period_end is null
      or p_period_end < p_period_start
      or extract(isodow from p_period_start) <> 1
      or extract(isodow from p_period_end) <> 7 then
    raise exception 'Payroll export periods must cover complete Monday-to-Sunday weeks.';
  end if;
  if p_period_end - p_period_start > 370 then
    raise exception 'Payroll export periods cannot exceed 53 weeks.';
  end if;

  -- Resolve and validate the column template.
  v_columns := coalesce(
    p_columns,
    (select s.payroll_export_columns from public.restaurant_settings s where s.restaurant_id = p_restaurant_id),
    '["payroll_id","employee_name","national_registry_number","date","time_range","service","entry_type","worked_hours","break_minutes","contract_type"]'::jsonb
  );
  if jsonb_typeof(v_columns) <> 'array' or jsonb_array_length(v_columns) = 0 then
    raise exception 'At least one export column is required.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(v_columns) as k(key)
    where public.payroll_export_field_label(k.key) is null
  ) then
    raise exception 'Unknown payroll export column requested.';
  end if;
  v_require_nrn := v_columns ? 'national_registry_number';

  v_week_count := ((p_period_end - p_period_start + 1) / 7);
  select count(*)
  into v_approved_count
  from public.work_weeks w
  where w.restaurant_id = p_restaurant_id
    and w.week_start between p_period_start and p_period_end
    and w.actuals_status in ('approved', 'locked');

  if v_approved_count <> v_week_count then
    raise exception 'Every included Timesheet week must be approved before payroll export.';
  end if;

  select coalesce(nullif(btrim(s.timezone), ''), 'Europe/Brussels')
  into v_timezone
  from public.restaurant_settings s
  where s.restaurant_id = p_restaurant_id;
  v_timezone := coalesce(v_timezone, 'Europe/Brussels');

  -- Identity completeness: payroll id + legal name always; national number only
  -- when that column is part of the export.
  select string_agg(e.display_name, ', ' order by e.display_name)
  into v_missing
  from public.time_entries t
  join public.employees e
    on e.restaurant_id = t.restaurant_id
   and e.id = t.employee_id
  left join public.employee_payroll_profiles pp
    on pp.restaurant_id = t.restaurant_id
   and pp.employee_id = t.employee_id
  left join public.employee_legal_profiles lp
    on lp.restaurant_id = t.restaurant_id
   and lp.employee_id = t.employee_id
  where t.restaurant_id = p_restaurant_id
    and t.business_date between p_period_start and p_period_end
    and t.status <> 'cancelled'
    and (
      nullif(btrim(pp.payroll_employee_id), '') is null
      or nullif(btrim(e.first_name), '') is null
      or nullif(btrim(e.last_name), '') is null
      or (v_require_nrn and nullif(btrim(lp.national_registry_number), '') is null)
    );

  if v_missing is not null then
    raise exception 'Complete payroll ID, legal name%s for: %.',
      case when v_require_nrn then ' and national number' else '' end, v_missing;
  end if;

  -- Build the per-entry field object once, then project the chosen columns in
  -- order. No dynamic SQL — keys are validated against the allowlist above.
  with export_entries as (
    select
      t.id,
      t.revision,
      t.business_date,
      greatest(
        0,
        floor(extract(epoch from (t.clock_out_at - t.clock_in_at)) / 60) - t.break_minutes
      )::integer as net_minutes,
      jsonb_build_object(
        'payroll_id', coalesce(pp.payroll_employee_id, ''),
        'employee_name', btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')),
        'national_registry_number', coalesce(lp.national_registry_number, ''),
        'date', t.business_date::text,
        'time_range',
          to_char(t.clock_in_at at time zone v_timezone, 'HH24:MI')
            || '–' || to_char(t.clock_out_at at time zone v_timezone, 'HH24:MI'),
        'service', initcap(t.service_key),
        'contract_type', coalesce(ct.code, ''),
        'entry_type',
          case
            when t.status = 'adjusted' or t.adjusted_at is not null then 'Corrected'
            else 'Worked'
          end,
        'worked_hours', round(
          greatest(0, floor(extract(epoch from (t.clock_out_at - t.clock_in_at)) / 60) - t.break_minutes)::numeric / 60,
          2
        ),
        'break_minutes', t.break_minutes,
        'notes', coalesce(t.adjustment_reason, '')
      ) as fields
    from public.time_entries t
    join public.employees e
      on e.restaurant_id = t.restaurant_id
     and e.id = t.employee_id
    left join public.employee_payroll_profiles pp
      on pp.restaurant_id = t.restaurant_id
     and pp.employee_id = t.employee_id
    left join public.employee_legal_profiles lp
      on lp.restaurant_id = t.restaurant_id
     and lp.employee_id = t.employee_id
    left join lateral (
      select c.contract_type_id
      from public.employee_contracts c
      where c.restaurant_id = t.restaurant_id
        and c.employee_id = t.employee_id
        and (c.contract_start is null or c.contract_start <= t.business_date)
        and (c.contract_end is null or c.contract_end >= t.business_date)
      order by c.contract_start desc nulls last, c.created_at desc
      limit 1
    ) contract on true
    left join public.contract_types ct
      on ct.restaurant_id = t.restaurant_id
     and ct.id = contract.contract_type_id
    where t.restaurant_id = p_restaurant_id
      and t.business_date between p_period_start and p_period_end
      and t.status <> 'cancelled'
      and t.clock_out_at is not null
    order by t.business_date, e.last_name, e.first_name, t.service_key
  )
  select
    coalesce(
      jsonb_agg(
        (
          select jsonb_agg(ee.fields -> col order by ord)
          from jsonb_array_elements_text(v_columns) with ordinality as c(col, ord)
        )
      ),
      '[]'::jsonb
    ),
    count(*)::integer,
    coalesce(sum(ee.net_minutes), 0)::integer
  into v_rows, v_row_count, v_total_minutes
  from export_entries ee;

  if v_row_count = 0 then
    raise exception 'The approved payroll period contains no worked entries.';
  end if;

  v_headers := (
    select jsonb_agg(public.payroll_export_field_label(col) order by ord)
    from jsonb_array_elements_text(v_columns) with ordinality as c(col, ord)
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'week_start', w.week_start,
        'actuals_status', w.actuals_status,
        'actuals_revision', w.actuals_revision,
        'approved_at', w.actuals_approved_at
      )
      order by w.week_start
    ),
    '[]'::jsonb
  )
  into v_sources
  from public.work_weeks w
  where w.restaurant_id = p_restaurant_id
    and w.week_start between p_period_start and p_period_end;

  v_filename := format(
    'payroll-%s-%s-%s.csv',
    p_period_start,
    p_period_end,
    left(v_run_id::text, 8)
  );
  v_payload := jsonb_build_object(
    'schema_version', 2,
    'format', 'generic_csv',
    'restaurant_id', p_restaurant_id,
    'period_start', p_period_start,
    'period_end', p_period_end,
    'timezone', v_timezone,
    'columns', v_columns,
    'headers', v_headers,
    'rows', v_rows,
    'entry_sources', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'time_entry_id', t.id,
            'time_entry_revision', t.revision,
            'business_date', t.business_date
          )
          order by t.business_date, t.id
        ),
        '[]'::jsonb
      )
      from public.time_entries t
      where t.restaurant_id = p_restaurant_id
        and t.business_date between p_period_start and p_period_end
        and t.status <> 'cancelled'
        and t.clock_out_at is not null
    )
  );
  v_sha256 := encode(
    extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.payroll_export_runs (
    id,
    restaurant_id,
    period_start,
    period_end,
    schema_version,
    filename,
    row_count,
    total_net_minutes,
    source_revisions,
    payload,
    payload_sha256,
    created_by_profile_id
  )
  values (
    v_run_id,
    p_restaurant_id,
    p_period_start,
    p_period_end,
    2,
    v_filename,
    v_row_count,
    v_total_minutes,
    v_sources,
    v_payload,
    v_sha256,
    v_profile_id
  );

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id,
    'run_id', v_run_id,
    'filename', v_filename,
    'row_count', v_row_count,
    'total_net_minutes', v_total_minutes,
    'payload_sha256', v_sha256,
    'payload', v_payload,
    'created_at', now()
  );
end
$$;


ALTER FUNCTION "public"."create_payroll_export_run"("p_restaurant_id" "uuid", "p_period_start" "date", "p_period_end" "date", "p_columns" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crypt"("password" "text", "salt" "text") RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'extensions'
    AS $$
  select extensions.crypt(password, salt);
$$;


ALTER FUNCTION "public"."crypt"("password" "text", "salt" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."crypt"("password" "text", "salt" "text") IS 'Public wrapper for extensions.crypt() - required because RPCs use SET search_path = public.';



CREATE OR REPLACE FUNCTION "public"."current_profile_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p.id from public.profiles p
  where p.auth_user_id = auth.uid()
  limit 1
$$;


ALTER FUNCTION "public"."current_profile_id"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."current_profile_id"() IS 'Returns the profiles.id for the current Supabase Auth session.';



CREATE OR REPLACE FUNCTION "public"."employee_invitation_states_for_restaurant"("p_restaurant_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', latest.id,
        'restaurant_id', latest.restaurant_id,
        'employee_id', latest.employee_id,
        'email', latest.email,
        'invited_role', latest.invited_role,
        'status', case
          when latest.status = 'pending' and latest.expires_at <= now()
            then 'expired'
          else latest.status
        end,
        'expires_at', latest.expires_at,
        'sent_at', latest.sent_at,
        'accepted_at', latest.accepted_at,
        'revoked_at', latest.revoked_at,
        'revoked_reason', latest.revoked_reason
      )
      order by latest.employee_id
    ),
    '[]'::jsonb
  )
  from (
    select distinct on (i.employee_id)
      i.id,
      i.restaurant_id,
      i.employee_id,
      i.email,
      i.invited_role,
      i.status,
      i.expires_at,
      i.sent_at,
      i.accepted_at,
      i.revoked_at,
      i.revoked_reason
    from public.employee_invitations i
    where i.restaurant_id = p_restaurant_id
    order by i.employee_id, i.sent_at desc, i.created_at desc
  ) latest
$$;


ALTER FUNCTION "public"."employee_invitation_states_for_restaurant"("p_restaurant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_employee_availability_mode"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_mode public.work_regime;
begin
  if public.is_owner_or_manager(new.restaurant_id) then return new; end if;

  select c.work_regime into v_mode
  from public.employee_contracts c
  where c.restaurant_id = new.restaurant_id
    and c.employee_id = new.employee_id
    and c.active
    and c.is_current
  order by c.created_at desc
  limit 1;

  if coalesce(v_mode, 'weekly_availability'::public.work_regime)
      <> 'weekly_availability'::public.work_regime then
    raise exception 'Weekly availability is not enabled for this employee.';
  end if;
  return new;
end
$$;


ALTER FUNCTION "public"."enforce_employee_availability_mode"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_fixed_restaurant_services"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_restaurant_id uuid;
  v_restaurant_ids uuid[];
begin
  if tg_table_name = 'restaurants' then
    v_restaurant_ids := array[new.id];
  elsif tg_op = 'INSERT' then
    v_restaurant_ids := array[new.restaurant_id];
  elsif tg_op = 'DELETE' then
    v_restaurant_ids := array[old.restaurant_id];
  else
    v_restaurant_ids := array[old.restaurant_id, new.restaurant_id];
  end if;

  foreach v_restaurant_id in array v_restaurant_ids
  loop
    if v_restaurant_id is null or not exists (
      select 1 from public.restaurants r where r.id = v_restaurant_id
    ) then
      continue;
    end if;

    if (
      select count(*)
      from public.services s
      where s.restaurant_id = v_restaurant_id
        and s.service_key in ('lunch', 'evening')
    ) <> 2 then
      raise exception
        'Every restaurant must retain Lunch and Evening service metadata. Disable a service instead of deleting it.';
    end if;
  end loop;

  return null;
end
$$;


ALTER FUNCTION "public"."enforce_fixed_restaurant_services"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_fixed_schedule_domain"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_restaurant_id uuid := new.restaurant_id;
  v_employee_id uuid := new.employee_id;
begin
  if tg_table_name = 'recurring_schedule_slots'
      and not coalesce(new.active, true) then
    return new;
  end if;

  if not exists (
    select 1
    from public.employee_contracts c
    where c.restaurant_id = v_restaurant_id
      and c.employee_id = v_employee_id
      and c.active
      and c.is_current
      and c.work_regime = 'fixed_schedule'
  ) then
    raise exception
      'Recurring schedule slots and work-pattern exceptions require a fixed-schedule employee.';
  end if;

  return new;
end
$$;


ALTER FUNCTION "public"."enforce_fixed_schedule_domain"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_owner_membership"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_owner uuid;
begin
  select owner_profile_id into v_owner
  from public.restaurants
  where id = coalesce(old.restaurant_id, new.restaurant_id);

  if v_owner is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' and old.profile_id = v_owner then
    raise exception 'The owner membership cannot be removed.';
  end if;

  if tg_op = 'UPDATE' and old.profile_id = v_owner
     and (new.role <> 'owner' or new.status <> 'active') then
    raise exception 'The owner membership cannot be demoted or deactivated.';
  end if;

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."enforce_owner_membership"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gen_salt"("type" "text") RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'extensions'
    AS $$
  select extensions.gen_salt(type);
$$;


ALTER FUNCTION "public"."gen_salt"("type" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."gen_salt"("type" "text") IS 'Public wrapper for extensions.gen_salt(type).';



CREATE OR REPLACE FUNCTION "public"."gen_salt"("type" "text", "iter_count" integer) RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'extensions'
    AS $$
  select extensions.gen_salt(type, iter_count);
$$;


ALTER FUNCTION "public"."gen_salt"("type" "text", "iter_count" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."gen_salt"("type" "text", "iter_count" integer) IS 'Public wrapper for extensions.gen_salt(type, iter_count).';



CREATE OR REPLACE FUNCTION "public"."generate_four_digit_pin"() RETURNS "text"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  select lpad((floor(random() * 10000)::int)::text, 4, '0')
$$;


ALTER FUNCTION "public"."generate_four_digit_pin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_memberships"() RETURNS TABLE("restaurant_id" "uuid", "workspace_slug" "text", "restaurant_name" "text", "role" "text", "employee_id" "uuid", "status" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    r.id            as restaurant_id,
    r.workspace_slug,
    r.name          as restaurant_name,
    m.role,
    ea.employee_id,
    m.status
  from public.profiles p
  join public.restaurant_memberships m  on m.profile_id   = p.id
  join public.restaurants r             on r.id           = m.restaurant_id
  left join public.employee_access ea   on ea.restaurant_id = m.restaurant_id
                                       and ea.profile_id  = p.id
  where p.auth_user_id = auth.uid()
    and m.status = 'active'
    and r.active = true
  order by r.name asc
$$;


ALTER FUNCTION "public"."get_current_memberships"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_employee_invitation_context"("p_restaurant_id" "uuid", "p_invitation_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_email citext := lower(btrim(coalesce(auth.jwt()->>'email', '')))::citext;
  v_context record;
begin
  if auth.uid() is null or v_email::text = '' then
    raise exception 'Sign in with the invited email account.';
  end if;
  if btrim(coalesce(p_invitation_token, '')) = '' then
    raise exception 'Invitation token is missing.';
  end if;

  select
    i.id,
    i.email,
    i.invited_role,
    i.expires_at,
    i.status,
    e.display_name,
    r.name as restaurant_name
  into v_context
  from public.employee_invitations i
  join public.employees e
    on e.restaurant_id = i.restaurant_id and e.id = i.employee_id
  join public.restaurants r on r.id = i.restaurant_id
  where i.restaurant_id = p_restaurant_id
    and i.token_hash = encode(
      extensions.digest(p_invitation_token, 'sha256'),
      'hex'
    )
  limit 1;

  if v_context.id is null
      or v_context.status <> 'pending'
      or v_context.expires_at <= now() then
    raise exception 'Invitation is invalid, expired or has already been used.';
  end if;
  if lower(v_context.email::text) <> lower(v_email::text) then
    raise exception 'Sign in with the email address that received this invitation.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'restaurant_name', v_context.restaurant_name,
    'employee_name', v_context.display_name,
    'role', v_context.invited_role,
    'expires_at', v_context.expires_at
  );
end
$$;


ALTER FUNCTION "public"."get_employee_invitation_context"("p_restaurant_id" "uuid", "p_invitation_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_employee_operations_read_model"("p_restaurant_id" "uuid", "p_from_date" "date", "p_to_date" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_context record;
begin
  if p_from_date is null or p_to_date is null or p_to_date < p_from_date then
    raise exception 'A valid employee date range is required.';
  end if;
  if p_to_date - p_from_date > 62 then
    raise exception 'Employee operations reads are limited to 63 days.';
  end if;
  select * into v_context from public.require_workspace_read_context(p_restaurant_id);
  if v_context.actor_role <> 'employee' or v_context.employee_id is null then
    raise exception 'Employee access required.';
  end if;
  return public.build_employee_operations_read_model(
    p_restaurant_id, v_context.employee_id, p_from_date, p_to_date
  );
end
$$;


ALTER FUNCTION "public"."get_employee_operations_read_model"("p_restaurant_id" "uuid", "p_from_date" "date", "p_to_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_manager_operations_read_model"("p_restaurant_id" "uuid", "p_from_date" "date", "p_to_date" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_context record;
begin
  if p_from_date is null or p_to_date is null or p_to_date < p_from_date then
    raise exception 'A valid operations date range is required.';
  end if;
  if p_to_date - p_from_date > 62 then
    raise exception 'Manager operations reads are limited to 63 days.';
  end if;
  select * into v_context from public.require_workspace_read_context(p_restaurant_id);
  if v_context.actor_role not in ('owner', 'manager') then
    raise exception 'Owner or manager access required.';
  end if;
  return public.build_manager_operations_read_model(
    p_restaurant_id, v_context.actor_role, p_from_date, p_to_date
  );
end
$$;


ALTER FUNCTION "public"."get_manager_operations_read_model"("p_restaurant_id" "uuid", "p_from_date" "date", "p_to_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_owner_onboarding_draft"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (
      select jsonb_build_object(
        'step', d.step,
        'draft', d.draft,
        'updated_at', d.updated_at
      )
      from public.owner_onboarding_drafts d
      where d.auth_user_id = auth.uid()
    ),
    '{}'::jsonb
  )
$$;


ALTER FUNCTION "public"."get_owner_onboarding_draft"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_payroll_export_run"("p_restaurant_id" "uuid", "p_run_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_run public.payroll_export_runs%rowtype;
begin
  if not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can access payroll exports.';
  end if;

  select * into v_run
  from public.payroll_export_runs r
  where r.restaurant_id = p_restaurant_id
    and r.id = p_run_id;

  if v_run.id is null then
    raise exception 'Payroll export run not found.';
  end if;

  return jsonb_build_object(
    'id', v_run.id,
    'restaurant_id', v_run.restaurant_id,
    'period_start', v_run.period_start,
    'period_end', v_run.period_end,
    'filename', v_run.filename,
    'row_count', v_run.row_count,
    'total_net_minutes', v_run.total_net_minutes,
    'payload_sha256', v_run.payload_sha256,
    'payload', v_run.payload,
    'created_by_profile_id', v_run.created_by_profile_id,
    'created_at', v_run.created_at
  );
end
$$;


ALTER FUNCTION "public"."get_payroll_export_run"("p_restaurant_id" "uuid", "p_run_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_restaurant_read_model"("p_restaurant_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_context record;
begin
  select * into v_context from public.require_workspace_read_context(p_restaurant_id);
  if v_context.actor_role <> 'owner' then
    raise exception 'Owner access required.';
  end if;
  return public.build_restaurant_read_model(p_restaurant_id);
end
$$;


ALTER FUNCTION "public"."get_restaurant_read_model"("p_restaurant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_team_read_model"("p_restaurant_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_context record;
begin
  select * into v_context from public.require_workspace_read_context(p_restaurant_id);
  if v_context.actor_role not in ('owner', 'manager') then
    raise exception 'Owner or manager access required.';
  end if;
  return public.build_team_read_model(p_restaurant_id, v_context.actor_role);
end
$$;


ALTER FUNCTION "public"."get_team_read_model"("p_restaurant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_workspace_bootstrap"("p_restaurant_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_context record;
begin
  select * into v_context from public.require_workspace_read_context(p_restaurant_id);
  return public.build_workspace_bootstrap_read_model(
    p_restaurant_id, v_context.employee_id
  );
end
$$;


ALTER FUNCTION "public"."get_workspace_bootstrap"("p_restaurant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_workspace_context"("p_restaurant_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_profile_id    uuid := public.current_profile_id();
  v_restaurant_id uuid;
  v_membership    record;
  v_restaurant    jsonb := '{}'::jsonb;
  v_settings      jsonb := '{}'::jsonb;
  v_onboarding_state jsonb := '{}'::jsonb;
  v_employee      jsonb := '{}'::jsonb;
begin
  if v_profile_id is null then
    raise exception 'Authenticated session required.';
  end if;

  if p_restaurant_id is not null then
    v_restaurant_id := p_restaurant_id;
  else
    select m.restaurant_id into v_restaurant_id
    from public.restaurant_memberships m
    join public.restaurants r on r.id = m.restaurant_id and r.active = true
    where m.profile_id = v_profile_id
      and m.status = 'active'
    order by m.created_at
    limit 1;
  end if;

  select
    m.restaurant_id,
    r.workspace_slug,
    r.name as restaurant_name,
    m.role,
    ea.employee_id,
    m.status
  into v_membership
  from public.restaurant_memberships m
  join public.restaurants r on r.id = m.restaurant_id and r.active = true
  left join public.employee_access ea
    on ea.restaurant_id = m.restaurant_id
   and ea.profile_id = m.profile_id
  where m.restaurant_id = v_restaurant_id
    and m.profile_id = v_profile_id
    and m.status = 'active'
  limit 1;

  if v_membership.restaurant_id is null then
    raise exception 'Workspace access denied.';
  end if;

  select to_jsonb(r) into v_restaurant
  from public.restaurants r
  where r.id = v_membership.restaurant_id;

  select to_jsonb(rs) into v_settings
  from public.restaurant_settings rs
  where rs.restaurant_id = v_membership.restaurant_id;

  select to_jsonb(os) into v_onboarding_state
  from public.restaurant_onboarding_state os
  where os.restaurant_id = v_membership.restaurant_id;

  if v_membership.employee_id is not null then
    select to_jsonb(e) into v_employee
    from public.employees e
    where e.restaurant_id = v_membership.restaurant_id
      and e.id = v_membership.employee_id;
  end if;

  return jsonb_build_object(
    'restaurant', coalesce(v_restaurant, '{}'::jsonb),
    'settings', coalesce(v_settings, '{}'::jsonb),
    'onboarding_state', coalesce(v_onboarding_state, '{}'::jsonb),
    'membership', jsonb_build_object(
      'restaurant_id', v_membership.restaurant_id,
      'workspace_slug', v_membership.workspace_slug,
      'restaurant_name', v_membership.restaurant_name,
      'role', v_membership.role,
      'employee_id', v_membership.employee_id,
      'status', v_membership.status
    ),
    'employee', coalesce(v_employee, '{}'::jsonb)
  );
end;
$$;


ALTER FUNCTION "public"."get_workspace_context"("p_restaurant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_actuals_approval"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_week_end date := new.week_start + 6;
  v_timezone text;
  v_local_today date;
begin
  if new.actuals_status not in ('approved', 'locked')
      or new.actuals_status is not distinct from old.actuals_status then
    return new;
  end if;

  select coalesce(nullif(btrim(s.timezone), ''), 'Europe/Brussels')
  into v_timezone
  from public.restaurant_settings s
  where s.restaurant_id = new.restaurant_id;
  v_local_today := (
    now() at time zone coalesce(v_timezone, 'Europe/Brussels')
  )::date;

  if v_local_today <= v_week_end then
    raise exception 'Timesheet can be approved only after the week has ended.';
  end if;

  -- Auto-finalize a missing Schedule baseline instead of dead-ending approval.
  -- This is not a bypass: the missing-badge guard below reads NEW, so it also
  -- applies to a baseline finalized inside this same trigger execution.
  if old.planning_status = 'draft'
      and exists (
        select 1
        from public.planned_shifts p
        where p.restaurant_id = new.restaurant_id
          and p.week_start = new.week_start
      ) then
    new.planning_status := 'published';
    new.published_at := coalesce(new.published_at, now());
    new.published_by_profile_id := coalesce(
      new.published_by_profile_id, new.actuals_approved_by_profile_id
    );
    new.planning_revision := coalesce(new.planning_revision, 0) + 1;

    insert into public.work_week_events (
      restaurant_id, week_start, event_type, actor_profile_id,
      actor_employee_id, actor_role, reason, previous_values, new_values, metadata
    )
    values (
      new.restaurant_id, new.week_start, 'planning_finalized',
      new.actuals_approved_by_profile_id, null,
      public.active_membership_role(new.restaurant_id, new.actuals_approved_by_profile_id),
      'Schedule baseline finalized automatically on Timesheet approval.',
      jsonb_build_object('planning_status', 'draft'),
      jsonb_build_object(
        'planning_status', 'published',
        'planning', public.planning_snapshot_for_week(new.restaurant_id, new.week_start)
      ),
      jsonb_build_object('auto', true)
    );
  end if;

  if exists (
    select 1
    from public.time_entries t
    where t.restaurant_id = new.restaurant_id
      and t.business_date between new.week_start and v_week_end
      and t.status = 'open'
  ) then
    raise exception 'Resolve live badges before approving Timesheet.';
  end if;

  if exists (
    select 1
    from public.planned_shifts p
    where p.restaurant_id = new.restaurant_id
      and p.week_start = new.week_start
      and new.planning_status = 'published'
      and not exists (
        select 1
        from public.time_entries t
        where t.restaurant_id = p.restaurant_id
          and t.employee_id = p.employee_id
          and t.business_date = p.week_start + (p.weekday - 1)
          and t.service_key = p.service_key
          and t.status <> 'cancelled'
      )
  ) then
    raise exception 'Resolve missing badges before approving Timesheet.';
  end if;

  if exists (
    select 1
    from public.time_entries t
    where t.restaurant_id = new.restaurant_id
      and t.business_date between new.week_start and v_week_end
      and t.status <> 'cancelled'
      and (
        exists (
          select 1
          from public.absences a
          where a.restaurant_id = t.restaurant_id
            and a.employee_id = t.employee_id
            and a.status = 'approved'
            and t.business_date between a.start_date and a.end_date
            and (a.service_key is null or a.service_key = t.service_key)
        )
        or exists (
          select 1
          from public.work_pattern_exceptions e
          where e.restaurant_id = t.restaurant_id
            and e.employee_id = t.employee_id
            and e.status = 'approved'
            and t.business_date between e.start_date and e.end_date
            and (e.service_key is null or e.service_key = t.service_key)
        )
        or exists (
          select 1
          from public.employee_availability_slots a
          where a.restaurant_id = t.restaurant_id
            and a.employee_id = t.employee_id
            and a.week_start = new.week_start
            and a.weekday = extract(isodow from t.business_date)
            and a.service_key = t.service_key
            and a.availability_state = 'unavailable'
        )
      )
  ) then
    raise exception 'Resolve worked-time conflicts before approving Timesheet.';
  end if;

  if exists (
    select 1
    from public.time_entries t
    where t.restaurant_id = new.restaurant_id
      and t.business_date between new.week_start and v_week_end
      and (
        (
          t.source = 'manager_manual'
          and not exists (
            select 1
            from public.time_entry_adjustments a
            where a.restaurant_id = t.restaurant_id
              and a.time_entry_id = t.id
              and a.action = 'manual_entry'
          )
        )
        or (
          t.status in ('adjusted', 'cancelled')
          and not exists (
            select 1
            from public.time_entry_adjustments a
            where a.restaurant_id = t.restaurant_id
              and a.time_entry_id = t.id
          )
        )
      )
  ) then
    raise exception 'Resolve missing time-entry audit evidence before approving Timesheet.';
  end if;

  return new;
end
$$;


ALTER FUNCTION "public"."guard_actuals_approval"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_employee_contract_history"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'Employment contracts are retained as operational history.';
  end if;
  if not old.active or not old.is_current then
    raise exception
      'Historical employment contracts are immutable.';
  end if;
  return new;
end
$$;


ALTER FUNCTION "public"."guard_employee_contract_history"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_time_entry_history"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_restaurant_id uuid := case when tg_op = 'DELETE' then old.restaurant_id else new.restaurant_id end;
  v_business_date date := case when tg_op = 'DELETE' then old.business_date else new.business_date end;
  v_status public.actuals_status;
begin
  if tg_op = 'DELETE' then
    raise exception 'Time entries are historical evidence and cannot be deleted.';
  end if;

  select w.actuals_status into v_status
  from public.work_weeks w
  where w.restaurant_id = v_restaurant_id
    and w.week_start = public.week_start_for_date(v_business_date);

  if v_status in ('approved', 'locked') then
    raise exception 'Reopen this Timesheet week before changing worked time.';
  end if;
  return new;
end
$$;


ALTER FUNCTION "public"."guard_time_entry_history"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_own_employee"("target_restaurant_id" "uuid", "target_employee_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.employee_access ea
    join public.employees e
      on e.restaurant_id = ea.restaurant_id
     and e.id            = ea.employee_id
     and e.active        = true
    join public.restaurant_memberships m
      on m.restaurant_id = ea.restaurant_id
     and m.profile_id    = ea.profile_id
     and m.status        = 'active'
    where ea.restaurant_id = target_restaurant_id
      and ea.employee_id   = target_employee_id
      and ea.profile_id    = public.current_profile_id()
      and ea.access_status = 'active'
  )
$$;


ALTER FUNCTION "public"."is_own_employee"("target_restaurant_id" "uuid", "target_employee_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_own_employee"("target_restaurant_id" "uuid", "target_employee_id" "uuid") IS 'True when the current real-auth session belongs to an active employee/access/membership record for the restaurant.';



CREATE OR REPLACE FUNCTION "public"."is_owner"("target_restaurant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.restaurant_memberships m
    join public.profiles p on p.id = m.profile_id
    where m.restaurant_id = target_restaurant_id
      and p.auth_user_id   = auth.uid()
      and m.role           = 'owner'
      and m.status         = 'active'
  );
$$;


ALTER FUNCTION "public"."is_owner"("target_restaurant_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_owner"("target_restaurant_id" "uuid") IS 'True when the current session user is owner of the restaurant.';



CREATE OR REPLACE FUNCTION "public"."is_owner_or_manager"("target_restaurant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.restaurant_memberships m
    where m.restaurant_id = target_restaurant_id
      and m.profile_id    = public.current_profile_id()
      and m.role          in ('owner', 'manager')
      and m.status        = 'active'
  )
$$;


ALTER FUNCTION "public"."is_owner_or_manager"("target_restaurant_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_owner_or_manager"("target_restaurant_id" "uuid") IS 'True when the current session user is owner or manager of the restaurant.';



CREATE OR REPLACE FUNCTION "public"."is_restaurant_member"("target_restaurant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.restaurant_memberships m
    where m.restaurant_id = target_restaurant_id
      and m.profile_id    = public.current_profile_id()
      and m.status        = 'active'
  )
$$;


ALTER FUNCTION "public"."is_restaurant_member"("target_restaurant_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_restaurant_member"("target_restaurant_id" "uuid") IS 'True when the current session user is an active member of the restaurant.';



CREATE OR REPLACE FUNCTION "public"."is_work_week_draft"("p_restaurant_id" "uuid", "p_week_start" "date") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (select ww.planning_status = 'draft'
     from public.work_weeks ww
     where ww.restaurant_id = p_restaurant_id
       and ww.week_start    = p_week_start),
    true   -- no row yet = treat as draft
  )
$$;


ALTER FUNCTION "public"."is_work_week_draft"("p_restaurant_id" "uuid", "p_week_start" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_work_week_draft"("p_restaurant_id" "uuid", "p_week_start" "date") IS 'True when the work week is in draft status (or does not yet exist).';



CREATE OR REPLACE FUNCTION "public"."list_badge_roster"("p_restaurant_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_rows jsonb;
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);
  select coalesce(
    jsonb_agg(
      jsonb_build_object('employee_id', e.id, 'display_name', e.display_name)
      order by e.display_name
    ),
    '[]'::jsonb
  )
  into v_rows
  from public.employees e
  join public.employee_access ea
    on ea.restaurant_id = e.restaurant_id and ea.employee_id = e.id
  join public.employee_pin_credentials pc
    on pc.restaurant_id = e.restaurant_id and pc.employee_id = e.id
  where e.restaurant_id = p_restaurant_id
    and e.active
    and ea.access_status = 'active'
    and ea.badge_enabled
    and pc.pin_status = 'active';

  return jsonb_build_object('restaurant_id', p_restaurant_id, 'employees', v_rows);
end;
$$;


ALTER FUNCTION "public"."list_badge_roster"("p_restaurant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."payroll_export_field_label"("p_key" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select case p_key
    when 'payroll_id' then 'Employee payroll ID'
    when 'employee_name' then 'Employee name'
    when 'national_registry_number' then 'National registry number'
    when 'date' then 'Date'
    when 'time_range' then 'Time range'
    when 'service' then 'Service'
    when 'contract_type' then 'Contract type'
    when 'entry_type' then 'Entry type'
    when 'worked_hours' then 'Worked hours'
    when 'break_minutes' then 'Break minutes'
    when 'notes' then 'Notes'
    else null
  end
$$;


ALTER FUNCTION "public"."payroll_export_field_label"("p_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."payroll_export_run_summaries"("p_restaurant_id" "uuid", "p_from_date" "date", "p_to_date" "date") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'restaurant_id', r.restaurant_id,
        'period_start', r.period_start,
        'period_end', r.period_end,
        'format', r.format,
        'schema_version', r.schema_version,
        'filename', r.filename,
        'row_count', r.row_count,
        'total_net_minutes', r.total_net_minutes,
        'payload_sha256', r.payload_sha256,
        'created_by_profile_id', r.created_by_profile_id,
        'created_at', r.created_at
      )
      order by r.created_at desc
    ),
    '[]'::jsonb
  )
  from public.payroll_export_runs r
  where r.restaurant_id = p_restaurant_id
    and r.period_start <= p_to_date
    and r.period_end >= p_from_date
$$;


ALTER FUNCTION "public"."payroll_export_run_summaries"("p_restaurant_id" "uuid", "p_from_date" "date", "p_to_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."planning_publish_issues"("p_restaurant_id" "uuid", "p_week_start" "date", "p_planned_shifts" "jsonb") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with shifts as (
    select
      nullif(value->>'employee_id', '')::uuid as employee_id,
      nullif(value->>'weekday', '')::smallint as weekday,
      lower(btrim(value->>'service_key')) as service_key,
      nullif(value->>'area_id', '')::uuid as area_id,
      nullif(value->>'job_function_id', '')::uuid as job_function_id
    from jsonb_array_elements(coalesce(p_planned_shifts, '[]'::jsonb))
  ),
  shift_conflicts as (
    select jsonb_build_object(
      'kind', 'employee_conflict',
      'employee_id', s.employee_id,
      'date', p_week_start + (s.weekday - 1),
      'service_key', s.service_key
    ) as issue
    from shifts s
    where exists (
      select 1
      from public.absences a
      where a.restaurant_id = p_restaurant_id
        and a.employee_id = s.employee_id
        and a.status in ('pending', 'approved')
        and p_week_start + (s.weekday - 1) between a.start_date and a.end_date
        and (a.service_key is null or a.service_key = s.service_key)
    )
    or exists (
      select 1
      from public.work_pattern_exceptions e
      where e.restaurant_id = p_restaurant_id
        and e.employee_id = s.employee_id
        and e.status in ('pending', 'approved')
        and p_week_start + (s.weekday - 1) between e.start_date and e.end_date
        and (e.service_key is null or e.service_key = s.service_key)
    )
    or exists (
      select 1
      from public.employee_availability_slots a
      where a.restaurant_id = p_restaurant_id
        and a.employee_id = s.employee_id
        and a.week_start = p_week_start
        and a.weekday = s.weekday
        and a.service_key = s.service_key
        and a.availability_state = 'unavailable'
    )
  ),
  applicable_requirements as (
    select
      o.weekday,
      o.service_key,
      r.area_id,
      r.job_function_id,
      r.required_count
    from public.opening_hours o
    cross join lateral (
      select distinct on (c.area_id, c.job_function_id)
        c.area_id,
        c.job_function_id,
        c.required_count
      from public.coverage_requirements c
      where c.restaurant_id = o.restaurant_id
        and c.service_key = o.service_key
        and c.active
        and c.required_count > 0
        and (c.weekday = o.weekday or c.weekday is null)
      order by
        c.area_id,
        c.job_function_id,
        (c.weekday = o.weekday) desc,
        c.sort_order,
        c.id
    ) r
    where o.restaurant_id = p_restaurant_id
      and o.is_open
  ),
  coverage_gaps as (
    select jsonb_build_object(
      'kind', 'coverage_gap',
      'date', p_week_start + (r.weekday - 1),
      'service_key', r.service_key,
      'area_id', r.area_id,
      'job_function_id', r.job_function_id,
      'required', r.required_count,
      'planned', count(s.employee_id),
      'missing', r.required_count - count(s.employee_id)
    ) as issue
    from applicable_requirements r
    left join shifts s
      on s.weekday = r.weekday
     and s.service_key = r.service_key
     and s.area_id = r.area_id
     and s.job_function_id = r.job_function_id
    group by
      r.weekday,
      r.service_key,
      r.area_id,
      r.job_function_id,
      r.required_count
    having count(s.employee_id) < r.required_count
  )
  select coalesce(
    jsonb_agg(issue),
    '[]'::jsonb
  )
  from (
    select issue from shift_conflicts
    union all
    select issue from coverage_gaps
  ) all_issues
$$;


ALTER FUNCTION "public"."planning_publish_issues"("p_restaurant_id" "uuid", "p_week_start" "date", "p_planned_shifts" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."planning_snapshot_for_week"("p_restaurant_id" "uuid", "p_week_start" "date") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'shifts',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'employee_id', p.employee_id,
            'weekday', p.weekday,
            'service_key', p.service_key,
            'area_id', p.area_id,
            'job_function_id', p.job_function_id,
            'starts_at', p.starts_at,
            'ends_at', p.ends_at,
            'source', p.source
          )
          order by p.weekday, p.service_key, p.employee_id
        )
        from public.planned_shifts p
        where p.restaurant_id = p_restaurant_id
          and p.week_start = p_week_start
      ),
      '[]'::jsonb
    ),
    'notes',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'weekday', n.weekday,
            'service_key', n.service_key,
            'note', n.note
          )
          order by n.weekday, n.service_key
        )
        from public.weekly_notes n
        where n.restaurant_id = p_restaurant_id
          and n.week_start = p_week_start
      ),
      '[]'::jsonb
    )
  )
$$;


ALTER FUNCTION "public"."planning_snapshot_for_week"("p_restaurant_id" "uuid", "p_week_start" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."preview_payroll_export"("p_restaurant_id" "uuid", "p_period_start" "date", "p_period_end" "date", "p_columns" "jsonb" DEFAULT NULL::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_timezone text;
  v_week_count integer;
  v_approved_count integer;
  v_columns jsonb;
  v_headers jsonb;
  v_rows jsonb;
  v_row_count integer;
  v_total_minutes integer;
  v_approved boolean;
begin
  if v_profile_id is null then
    raise exception 'Authenticated session required.';
  end if;
  if not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can export payroll.';
  end if;
  if p_period_start is null
      or p_period_end is null
      or p_period_end < p_period_start
      or extract(isodow from p_period_start) <> 1
      or extract(isodow from p_period_end) <> 7 then
    raise exception 'Payroll export periods must cover complete Monday-to-Sunday weeks.';
  end if;
  if p_period_end - p_period_start > 370 then
    raise exception 'Payroll export periods cannot exceed 53 weeks.';
  end if;

  -- Resolve and validate the column template (same allowlist as the official run).
  v_columns := coalesce(
    p_columns,
    (select s.payroll_export_columns from public.restaurant_settings s where s.restaurant_id = p_restaurant_id),
    '["payroll_id","employee_name","national_registry_number","date","time_range","service","entry_type","worked_hours","break_minutes","contract_type"]'::jsonb
  );
  if jsonb_typeof(v_columns) <> 'array' or jsonb_array_length(v_columns) = 0 then
    raise exception 'At least one export column is required.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(v_columns) as k(key)
    where public.payroll_export_field_label(k.key) is null
  ) then
    raise exception 'Unknown payroll export column requested.';
  end if;

  v_week_count := ((p_period_end - p_period_start + 1) / 7);
  select count(*)
  into v_approved_count
  from public.work_weeks w
  where w.restaurant_id = p_restaurant_id
    and w.week_start between p_period_start and p_period_end
    and w.actuals_status in ('approved', 'locked');
  v_approved := v_approved_count = v_week_count;

  select coalesce(nullif(btrim(s.timezone), ''), 'Europe/Brussels')
  into v_timezone
  from public.restaurant_settings s
  where s.restaurant_id = p_restaurant_id;
  v_timezone := coalesce(v_timezone, 'Europe/Brussels');

  -- Identical per-entry projection to create_payroll_export_run; chosen columns
  -- projected in order. No identity gate — a draft may have blanks.
  with export_entries as (
    select
      greatest(
        0,
        floor(extract(epoch from (t.clock_out_at - t.clock_in_at)) / 60) - t.break_minutes
      )::integer as net_minutes,
      jsonb_build_object(
        'payroll_id', coalesce(pp.payroll_employee_id, ''),
        'employee_name', btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')),
        'national_registry_number', coalesce(lp.national_registry_number, ''),
        'date', t.business_date::text,
        'time_range',
          to_char(t.clock_in_at at time zone v_timezone, 'HH24:MI')
            || '–' || to_char(t.clock_out_at at time zone v_timezone, 'HH24:MI'),
        'service', initcap(t.service_key),
        'contract_type', coalesce(ct.code, ''),
        'entry_type',
          case
            when t.status = 'adjusted' or t.adjusted_at is not null then 'Corrected'
            else 'Worked'
          end,
        'worked_hours', round(
          greatest(0, floor(extract(epoch from (t.clock_out_at - t.clock_in_at)) / 60) - t.break_minutes)::numeric / 60,
          2
        ),
        'break_minutes', t.break_minutes,
        'notes', coalesce(t.adjustment_reason, '')
      ) as fields
    from public.time_entries t
    join public.employees e
      on e.restaurant_id = t.restaurant_id
     and e.id = t.employee_id
    left join public.employee_payroll_profiles pp
      on pp.restaurant_id = t.restaurant_id
     and pp.employee_id = t.employee_id
    left join public.employee_legal_profiles lp
      on lp.restaurant_id = t.restaurant_id
     and lp.employee_id = t.employee_id
    left join lateral (
      select c.contract_type_id
      from public.employee_contracts c
      where c.restaurant_id = t.restaurant_id
        and c.employee_id = t.employee_id
        and (c.contract_start is null or c.contract_start <= t.business_date)
        and (c.contract_end is null or c.contract_end >= t.business_date)
      order by c.contract_start desc nulls last, c.created_at desc
      limit 1
    ) contract on true
    left join public.contract_types ct
      on ct.restaurant_id = t.restaurant_id
     and ct.id = contract.contract_type_id
    where t.restaurant_id = p_restaurant_id
      and t.business_date between p_period_start and p_period_end
      and t.status <> 'cancelled'
      and t.clock_out_at is not null
    order by t.business_date, e.last_name, e.first_name, t.service_key
  )
  select
    coalesce(
      jsonb_agg(
        (
          select jsonb_agg(ee.fields -> col order by ord)
          from jsonb_array_elements_text(v_columns) with ordinality as c(col, ord)
        )
      ),
      '[]'::jsonb
    ),
    count(*)::integer,
    coalesce(sum(ee.net_minutes), 0)::integer
  into v_rows, v_row_count, v_total_minutes
  from export_entries ee;

  if v_row_count = 0 then
    raise exception 'This period has no worked entries to export.';
  end if;

  v_headers := (
    select jsonb_agg(public.payroll_export_field_label(col) order by ord)
    from jsonb_array_elements_text(v_columns) with ordinality as c(col, ord)
  );

  return jsonb_build_object(
    'ok', true,
    'approved', v_approved,
    'restaurant_id', p_restaurant_id,
    'period_start', p_period_start,
    'period_end', p_period_end,
    'columns', v_columns,
    'headers', v_headers,
    'rows', v_rows,
    'row_count', v_row_count,
    'total_net_minutes', v_total_minutes
  );
end
$$;


ALTER FUNCTION "public"."preview_payroll_export"("p_restaurant_id" "uuid", "p_period_start" "date", "p_period_end" "date", "p_columns" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_badge_entry"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_badge_token" "uuid", "p_service_key" "text" DEFAULT NULL::"text", "p_photo_url" "text" DEFAULT NULL::"text", "p_photo_status" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor record;
  v_challenge record;
  v_open_entry record;
  v_badged_at timestamptz := now();
  v_timezone text;
  v_business_date date;
  v_service_key text := lower(trim(coalesce(p_service_key, '')));
  v_photo_status text := public.badge_photo_status_to_db(p_photo_status, p_photo_url);
  v_entry_id uuid;
  v_action text;
begin
  select * into v_actor
  from public.require_owner_or_manager_context(p_restaurant_id)
  limit 1;

  if not exists (
    select 1
    from public.employees e
    join public.employee_access ea
      on ea.restaurant_id = e.restaurant_id and ea.employee_id = e.id
    where e.restaurant_id = p_restaurant_id
      and e.id = p_employee_id
      and e.active
      and ea.access_status = 'active'
      and ea.badge_enabled
  ) then
    raise exception 'Employee badge access is not active.';
  end if;

  select * into v_challenge
  from public.badge_verification_challenges c
  where c.restaurant_id = p_restaurant_id
    and c.employee_id = p_employee_id
    and c.actor_profile_id = v_actor.profile_id
    and c.token_hash = encode(extensions.digest(p_badge_token::text, 'sha256'), 'hex')
    and c.used_at is null
    and c.expires_at >= v_badged_at
  limit 1
  for update;

  if v_challenge.id is null then
    raise exception 'Badge verification expired or was already used. Enter the PIN again.';
  end if;
  update public.badge_verification_challenges set used_at = v_badged_at where id = v_challenge.id;
  update public.employee_pin_credentials
  set last_used_at = v_badged_at, updated_at = v_badged_at
  where restaurant_id = p_restaurant_id and employee_id = p_employee_id;

  select coalesce(nullif(trim(rs.timezone), ''), 'Europe/Brussels')
  into v_timezone
  from public.restaurant_settings rs
  where rs.restaurant_id = p_restaurant_id;
  v_timezone := coalesce(v_timezone, 'Europe/Brussels');
  v_business_date := (v_badged_at at time zone v_timezone)::date;

  select * into v_open_entry
  from public.time_entries t
  where t.restaurant_id = p_restaurant_id
    and t.employee_id = p_employee_id
    and t.status = 'open'
  order by t.clock_in_at desc
  limit 1
  for update;

  if v_open_entry.id is not null then
    update public.time_entries
    set clock_out_at = v_badged_at,
        clock_out_photo_url = nullif(trim(coalesce(p_photo_url, '')), ''),
        clock_out_photo_status = v_photo_status,
        clock_out_photo_captured_at = case when nullif(trim(coalesce(p_photo_url, '')), '') is null then null else v_badged_at end,
        status = 'closed',
        updated_at = v_badged_at
    where id = v_open_entry.id
    returning id into v_entry_id;
    v_action := 'out';
  else
    if v_service_key not in ('lunch', 'evening') or not exists (
      select 1 from public.services s
      where s.restaurant_id = p_restaurant_id
        and s.service_key = v_service_key
        and s.active
    ) then
      raise exception 'Select an active service before clocking in.';
    end if;
    insert into public.time_entries (
      restaurant_id, employee_id, business_date, service_key,
      clock_in_at, clock_in_photo_url, clock_in_photo_status,
      clock_in_photo_captured_at, source, status
    )
    values (
      p_restaurant_id, p_employee_id, v_business_date, v_service_key,
      v_badged_at, nullif(trim(coalesce(p_photo_url, '')), ''), v_photo_status,
      case when nullif(trim(coalesce(p_photo_url, '')), '') is null then null else v_badged_at end,
      'badge_terminal', 'open'
    )
    returning id into v_entry_id;
    v_action := 'in';
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', v_action,
    'badged_at', v_badged_at,
    'local_time', to_char(v_badged_at at time zone v_timezone, 'HH24:MI'),
    'timezone', v_timezone,
    'time_entry', (select to_jsonb(t) from public.time_entries t where t.id = v_entry_id)
  );
end;
$$;


ALTER FUNCTION "public"."record_badge_entry"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_badge_token" "uuid", "p_service_key" "text", "p_photo_url" "text", "p_photo_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_employee_invitation"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_email" "public"."citext", "p_role" "text", "p_token" "text", "p_expires_at" timestamp with time zone, "p_invited_by_profile_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor_role text;
  v_email citext := lower(btrim(coalesce(p_email::text, '')))::citext;
  v_contact_email citext;
  v_invitation_id uuid;
begin
  if p_restaurant_id is null or p_employee_id is null then
    raise exception 'Restaurant and employee are required.';
  end if;
  if p_invited_by_profile_id is null then
    raise exception 'Inviting profile is required.';
  end if;
  if v_email::text = '' then raise exception 'Employee email is required.'; end if;
  if p_role not in ('manager', 'employee') then
    raise exception 'Invitation role must be employee or manager.';
  end if;
  if btrim(coalesce(p_token, '')) = '' then
    raise exception 'Invitation token is required.';
  end if;
  if p_expires_at <= now() then
    raise exception 'Invitation expiry must be in the future.';
  end if;

  select m.role into v_actor_role
  from public.restaurant_memberships m
  where m.restaurant_id = p_restaurant_id
    and m.profile_id = p_invited_by_profile_id
    and m.status = 'active'
    and m.role in ('owner', 'manager')
  limit 1;

  if v_actor_role is null then
    raise exception 'Owner or manager access is required.';
  end if;
  if p_role = 'manager' and v_actor_role <> 'owner' then
    raise exception 'Only an owner can invite a manager.';
  end if;

  select c.email into v_contact_email
  from public.employees e
  join public.employee_contact_details c
    on c.restaurant_id = e.restaurant_id
   and c.employee_id = e.id
  where e.restaurant_id = p_restaurant_id
    and e.id = p_employee_id
    and e.active
  limit 1;

  if v_contact_email is null then
    raise exception 'Save an employee email before sending an invitation.';
  end if;
  if lower(v_contact_email::text) <> lower(v_email::text) then
    raise exception 'Invitation email must match the saved employee email.';
  end if;

  if exists (
    select 1
    from public.employee_access ea
    where ea.restaurant_id = p_restaurant_id
      and ea.employee_id = p_employee_id
      and ea.profile_id is not null
  ) then
    raise exception 'This employee already has a linked account. Restore access instead.';
  end if;

  if exists (
    select 1
    from public.profiles p
    join public.employee_access ea
      on ea.profile_id = p.id
     and ea.restaurant_id = p_restaurant_id
    where lower(p.email::text) = lower(v_email::text)
      and ea.employee_id <> p_employee_id
  ) then
    raise exception 'This email is already linked to another employee in the restaurant.';
  end if;

  update public.employee_invitations
  set status = 'expired',
      updated_at = now()
  where status = 'pending'
    and expires_at <= now();

  if exists (
    select 1
    from public.employee_invitations i
    where i.restaurant_id = p_restaurant_id
      and i.email = v_email
      and i.employee_id <> p_employee_id
      and i.status = 'pending'
  ) then
    raise exception 'This email already has a pending invitation for another employee.';
  end if;

  if exists (
    select 1
    from public.employee_invitations i
    where i.restaurant_id = p_restaurant_id
      and i.employee_id = p_employee_id
      and i.status = 'pending'
      and i.sent_at > now() - interval '1 minute'
  ) then
    raise exception 'Wait a minute before resending this invitation.';
  end if;

  update public.employee_invitations
  set status = 'revoked',
      revoked_at = now(),
      revoked_by_profile_id = p_invited_by_profile_id,
      revoked_reason = 'Superseded by a new invitation',
      updated_at = now()
  where restaurant_id = p_restaurant_id
    and employee_id = p_employee_id
    and status = 'pending';

  insert into public.employee_invitations (
    restaurant_id,
    employee_id,
    email,
    invited_role,
    token_hash,
    expires_at,
    invited_by_profile_id
  )
  values (
    p_restaurant_id,
    p_employee_id,
    v_email,
    p_role,
    encode(extensions.digest(p_token, 'sha256'), 'hex'),
    p_expires_at,
    p_invited_by_profile_id
  )
  returning id into v_invitation_id;

  insert into public.employee_access (
    restaurant_id, employee_id, access_status, badge_enabled
  )
  values (p_restaurant_id, p_employee_id, 'disabled', false)
  on conflict (restaurant_id, employee_id) do nothing;

  return jsonb_build_object(
    'ok', true,
    'invitation_id', v_invitation_id,
    'email', v_email,
    'expires_at', p_expires_at
  );
end
$$;


ALTER FUNCTION "public"."register_employee_invitation"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_email" "public"."citext", "p_role" "text", "p_token" "text", "p_expires_at" timestamp with time zone, "p_invited_by_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_audit_evidence_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  raise exception '% is append-only operational evidence.', tg_table_name;
end
$$;


ALTER FUNCTION "public"."reject_audit_evidence_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_payroll_export_evidence_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  raise exception 'Payroll export runs are immutable operational evidence.';
end
$$;


ALTER FUNCTION "public"."reject_payroll_export_evidence_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."require_owner_context"("p_restaurant_id" "uuid") RETURNS TABLE("profile_id" "uuid", "employee_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_profile_id  uuid;
  v_employee_id uuid;
begin
  if p_restaurant_id is null then
    raise exception 'Restaurant is required.';
  end if;

  v_profile_id := public.current_profile_id();

  if v_profile_id is null or not public.is_owner(p_restaurant_id) then
    raise exception 'Owner session required.';
  end if;

  select ea.employee_id into v_employee_id
  from public.employee_access ea
  where ea.restaurant_id = p_restaurant_id
    and ea.profile_id    = v_profile_id
  limit 1;

  profile_id  := v_profile_id;
  employee_id := v_employee_id;
  return next;
end;
$$;


ALTER FUNCTION "public"."require_owner_context"("p_restaurant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."require_owner_or_manager_context"("p_restaurant_id" "uuid") RETURNS TABLE("profile_id" "uuid", "employee_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_profile_id  uuid;
  v_employee_id uuid;
begin
  if p_restaurant_id is null then
    raise exception 'Restaurant is required.';
  end if;

  v_profile_id := public.current_profile_id();

  if v_profile_id is null or not public.is_owner_or_manager(p_restaurant_id) then
    raise exception 'Owner or manager session required.';
  end if;

  select ea.employee_id into v_employee_id
  from public.employee_access ea
  where ea.restaurant_id = p_restaurant_id
    and ea.profile_id    = v_profile_id
  limit 1;

  profile_id  := v_profile_id;
  employee_id := v_employee_id;
  return next;
end;
$$;


ALTER FUNCTION "public"."require_owner_or_manager_context"("p_restaurant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."require_workspace_read_context"("p_restaurant_id" "uuid") RETURNS TABLE("profile_id" "uuid", "actor_role" "text", "employee_id" "uuid")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_profile_id uuid := public.current_profile_id();
begin
  if v_profile_id is null then
    raise exception 'Authenticated session required.';
  end if;

  return query
  select m.profile_id, m.role, ea.employee_id
  from public.restaurant_memberships m
  join public.restaurants r
    on r.id = m.restaurant_id
   and r.active
  left join public.employee_access ea
    on ea.restaurant_id = m.restaurant_id
   and ea.profile_id = m.profile_id
   and ea.access_status = 'active'
  where m.restaurant_id = p_restaurant_id
    and m.profile_id = v_profile_id
    and m.status = 'active'
  limit 1;

  if not found then
    raise exception 'Active workspace membership required.';
  end if;
end
$$;


ALTER FUNCTION "public"."require_workspace_read_context"("p_restaurant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_employee_invitation"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor record;
  v_invitation public.employee_invitations%rowtype;
begin
  select * into v_actor
  from public.require_owner_or_manager_context(p_restaurant_id)
  limit 1;

  update public.employee_invitations
  set status = 'expired',
      updated_at = now()
  where status = 'pending'
    and expires_at <= now();

  select * into v_invitation
  from public.employee_invitations i
  where i.restaurant_id = p_restaurant_id
    and i.employee_id = p_employee_id
    and i.status = 'pending'
  order by i.sent_at desc
  limit 1
  for update;

  if v_invitation.id is null then
    raise exception 'No pending invitation exists for this employee.';
  end if;
  if v_invitation.invited_role = 'manager'
      and public.active_membership_role(
        p_restaurant_id,
        v_actor.profile_id
      ) <> 'owner' then
    raise exception 'Only an owner can revoke a manager invitation.';
  end if;

  update public.employee_invitations
  set status = 'revoked',
      revoked_at = now(),
      revoked_by_profile_id = v_actor.profile_id,
      revoked_reason = coalesce(
        nullif(btrim(p_reason), ''),
        'Revoked by a workspace administrator'
      ),
      updated_at = now()
  where id = v_invitation.id;

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id
  );
end
$$;


ALTER FUNCTION "public"."revoke_employee_invitation"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_employee_invitation_delivery"("p_invitation_id" "uuid", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.employee_invitations
  set status = 'revoked',
      revoked_at = now(),
      revoked_reason = coalesce(
        nullif(btrim(p_reason), ''),
        'Invitation email delivery failed'
      ),
      updated_at = now()
  where id = p_invitation_id
    and status = 'pending';

  return jsonb_build_object('ok', found);
end
$$;


ALTER FUNCTION "public"."revoke_employee_invitation_delivery"("p_invitation_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_absence_lifecycle"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_absence_id" "uuid" DEFAULT NULL::"uuid", "p_action" "text" DEFAULT NULL::"text", "p_payload" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor_profile_id    uuid := public.current_profile_id();
  v_actor_employee_id   uuid;
  v_actor_role          text;
  v_action              text := lower(trim(coalesce(p_action, '')));
  v_now                 timestamptz := now();
  v_absence             record;
  v_absence_id          uuid;
  v_absence_type_id     uuid;
  v_start_date          date;
  v_end_date            date;
  v_service_key         text;
  v_employee_comment    text;
  v_manager_comment     text;
  v_cancellation_reason text;
  v_metadata            jsonb;
  v_from_status         public.operational_request_status;
  v_to_status           public.operational_request_status;
  v_event_type          text;
  v_duration_days       numeric;
  v_duration_hours      numeric;
  v_is_manager          boolean := false;
  v_overlap_exists      boolean := false;
  v_event_id            uuid;
begin
  if p_restaurant_id is null then raise exception 'Restaurant is required.'; end if;
  if v_action = '' then raise exception 'Absence lifecycle action is required.'; end if;
  if v_action not in (
    'create_by_employee', 'create_by_manager', 'approve', 'reject',
    'cancel_by_employee', 'cancel_by_manager', 'cancel_for_planning', 'update_manager_comment'
  ) then
    raise exception 'Unsupported absence lifecycle action: %', v_action;
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Absence lifecycle payload must be a JSON object.';
  end if;

  if v_actor_profile_id is null then
    raise exception 'Authenticated session required.';
  end if;

  select m.role, ea.employee_id
    into v_actor_role, v_actor_employee_id
  from public.restaurant_memberships m
  left join public.employee_access ea
    on ea.restaurant_id = m.restaurant_id
   and ea.profile_id = m.profile_id
   and ea.access_status <> 'disabled'
  where m.restaurant_id = p_restaurant_id
    and m.profile_id = v_actor_profile_id
    and m.status = 'active'
  limit 1;

  if v_actor_role is null then raise exception 'Workspace access denied.'; end if;

  v_actor_role := lower(v_actor_role);
  v_is_manager := v_actor_role in ('owner', 'manager');

  if v_action in ('create_by_manager','approve','reject','cancel_by_manager','cancel_for_planning','update_manager_comment') and not v_is_manager then
    raise exception 'Owner or manager access required for this absence action.';
  end if;

  if v_action in ('create_by_employee','cancel_by_employee') then
    if v_actor_role <> 'employee' then
      raise exception 'Employee self-service access required for this absence action.';
    end if;
    if p_employee_id is null or v_actor_employee_id is null or p_employee_id <> v_actor_employee_id then
      raise exception 'Employees can only manage their own absence requests.';
    end if;
  end if;

  v_metadata := coalesce(p_payload->'metadata', '{}'::jsonb);
  if jsonb_typeof(v_metadata) <> 'object' then v_metadata := '{}'::jsonb; end if;

  v_employee_comment := nullif(trim(coalesce(p_payload->>'employee_comment', '')), '');
  v_manager_comment  := nullif(trim(coalesce(p_payload->>'manager_comment',  '')), '');
  v_cancellation_reason := nullif(trim(coalesce(p_payload->>'cancellation_reason', '')), '');

  if v_action in ('create_by_employee', 'create_by_manager') then
    if p_employee_id is null then raise exception 'Employee is required to create an absence.'; end if;

    if not exists (
      select 1 from public.employees e
      where e.restaurant_id = p_restaurant_id
        and e.id = p_employee_id
        and e.active = true
    ) then
      raise exception 'Active employee not found for this restaurant.';
    end if;

    v_absence_type_id := nullif(p_payload->>'absence_type_id', '')::uuid;
    if v_absence_type_id is null then
      raise exception 'Absence type is required.';
    end if;
    if not exists (
      select 1 from public.absence_types at
      where at.restaurant_id = p_restaurant_id
        and at.id = v_absence_type_id
        and at.active = true
    ) then
      raise exception 'Active absence type not found for this restaurant.';
    end if;

    v_start_date := nullif(p_payload->>'start_date', '')::date;
    v_end_date   := nullif(p_payload->>'end_date', '')::date;
    if v_start_date is null or v_end_date is null then raise exception 'Start and end date are required.'; end if;
    if v_end_date < v_start_date then raise exception 'Absence end date cannot be before start date.'; end if;

    v_service_key := lower(nullif(trim(coalesce(p_payload->>'service_key', '')), ''));
    if v_service_key in ('full_day','full-day','all_day','all-day','all','day') then v_service_key := null; end if;
    if v_service_key is not null and not exists (
      select 1 from public.services s
      where s.restaurant_id = p_restaurant_id and s.service_key = v_service_key and s.active = true
    ) then
      raise exception 'Active service not found for this restaurant.';
    end if;

    select exists (
      select 1 from public.absences a
      where a.restaurant_id = p_restaurant_id
        and a.employee_id = p_employee_id
        and a.status in ('pending','approved')
        and daterange(a.start_date, a.end_date, '[]') && daterange(v_start_date, v_end_date, '[]')
        and (a.service_key is null or v_service_key is null or a.service_key = v_service_key)
    ) into v_overlap_exists;

    if v_overlap_exists then
      raise exception 'An active absence already overlaps this period for this employee.';
    end if;

    v_duration_days  := coalesce(nullif(p_payload->>'duration_days',  '')::numeric, (v_end_date - v_start_date + 1)::numeric);
    v_duration_hours := coalesce(nullif(p_payload->>'duration_hours', '')::numeric, 0);
    if v_duration_days < 0 or v_duration_hours < 0 then raise exception 'Absence duration cannot be negative.'; end if;

    if v_action = 'create_by_employee' then
      v_to_status := 'pending';
      v_event_type := 'requested';
    else
      v_to_status := lower(trim(coalesce(nullif(p_payload->>'status', ''), 'approved')))::public.operational_request_status;
      if v_to_status not in ('pending','approved') then
        raise exception 'Manager-created absence status must be pending or approved.';
      end if;
      v_event_type := 'created_by_manager';
    end if;

    insert into public.absences (
      restaurant_id, employee_id, absence_type_id, start_date, end_date, service_key,
      status, requested_by_profile_id, approved_by_profile_id, approved_at,
      employee_comment, manager_comment, duration_days, duration_hours,
      payroll_export_status, metadata
    ) values (
      p_restaurant_id, p_employee_id, v_absence_type_id, v_start_date, v_end_date, v_service_key,
      v_to_status,
      case when v_action = 'create_by_employee' then v_actor_profile_id else null end,
      case when v_to_status = 'approved' then v_actor_profile_id else null end,
      case when v_to_status = 'approved' then v_now else null end,
      v_employee_comment, v_manager_comment, v_duration_days, v_duration_hours,
      'not_exported', v_metadata
    ) returning id into v_absence_id;

    v_from_status := null;
  else
    if p_absence_id is null then raise exception 'Absence id is required for this action.'; end if;

    select * into v_absence
    from public.absences a
    where a.restaurant_id = p_restaurant_id
      and a.id = p_absence_id
      and (p_employee_id is null or a.employee_id = p_employee_id)
    for update;

    if not found then raise exception 'Absence not found for this restaurant.'; end if;

    v_absence_id := v_absence.id;
    v_from_status := v_absence.status;
    v_to_status := v_from_status;

    if v_action = 'cancel_by_employee' then
      if v_absence.employee_id <> v_actor_employee_id then raise exception 'Employees can only cancel their own absence requests.'; end if;
      if v_absence.status <> 'pending' then raise exception 'Only pending requests can be cancelled by the employee.'; end if;
      v_to_status := 'cancelled';
      v_event_type := 'cancelled_by_employee';

      update public.absences
         set status = v_to_status,
             cancelled_at = v_now,
             cancelled_by_profile_id = v_actor_profile_id,
             cancelled_by_role = v_actor_role,
             employee_comment = coalesce(v_employee_comment, employee_comment),
             cancellation_reason = coalesce(v_cancellation_reason, v_employee_comment, cancellation_reason),
             updated_at = v_now
       where id = v_absence_id;

    elsif v_action = 'approve' then
      if v_absence.status <> 'pending' then raise exception 'Only pending absences can be approved.'; end if;

      select exists (
        select 1 from public.absences a
        where a.restaurant_id = p_restaurant_id
          and a.employee_id = v_absence.employee_id
          and a.id <> v_absence_id
          and a.status in ('pending','approved')
          and daterange(a.start_date, a.end_date, '[]') && daterange(v_absence.start_date, v_absence.end_date, '[]')
          and (a.service_key is null or v_absence.service_key is null or a.service_key = v_absence.service_key)
      ) into v_overlap_exists;
      if v_overlap_exists then raise exception 'Another active absence overlaps this period for this employee.'; end if;

      v_to_status := 'approved';
      v_event_type := 'approved';
      update public.absences
         set status = v_to_status,
             approved_by_profile_id = v_actor_profile_id,
             approved_at = v_now,
             rejected_by_profile_id = null,
             rejected_at = null,
             manager_comment = coalesce(v_manager_comment, manager_comment),
             updated_at = v_now
       where id = v_absence_id;

    elsif v_action = 'reject' then
      if v_absence.status <> 'pending' then raise exception 'Only pending absences can be rejected.'; end if;
      if v_manager_comment is null then raise exception 'Manager rejection comment is required.'; end if;
      v_to_status := 'rejected';
      v_event_type := 'rejected';
      update public.absences
         set status = v_to_status,
             rejected_by_profile_id = v_actor_profile_id,
             rejected_at = v_now,
             approved_by_profile_id = null,
             approved_at = null,
             manager_comment = v_manager_comment,
             updated_at = v_now
       where id = v_absence_id;

    elsif v_action in ('cancel_by_manager', 'cancel_for_planning') then
      if v_absence.status not in ('pending','approved') then raise exception 'Only pending or approved absences can be cancelled.'; end if;
      v_to_status := 'cancelled';
      v_event_type := case when v_action = 'cancel_for_planning' then 'cancelled_from_planning' else 'cancelled_by_manager' end;
      if v_action = 'cancel_for_planning' and v_cancellation_reason is null and v_manager_comment is null then
        v_cancellation_reason := 'Cancelled from planning to allow shift assignment.';
      end if;
      update public.absences
         set status = v_to_status,
             cancelled_at = v_now,
             cancelled_by_profile_id = v_actor_profile_id,
             cancelled_by_role = v_actor_role,
             manager_comment = coalesce(v_manager_comment, manager_comment),
             cancellation_reason = coalesce(v_cancellation_reason, v_manager_comment, cancellation_reason),
             updated_at = v_now
       where id = v_absence_id;

    elsif v_action = 'update_manager_comment' then
      v_event_type := 'manager_comment_updated';
      update public.absences
         set manager_comment = v_manager_comment,
             updated_at = v_now
       where id = v_absence_id;
    end if;
  end if;

  insert into public.absence_events (
    restaurant_id, absence_id, actor_profile_id, actor_employee_id, actor_role,
    event_type, from_status, to_status, comment, metadata
  ) values (
    p_restaurant_id, v_absence_id, v_actor_profile_id, v_actor_employee_id, v_actor_role,
    v_event_type, v_from_status, v_to_status,
    coalesce(v_manager_comment, v_employee_comment, v_cancellation_reason),
    v_metadata || jsonb_build_object('action', v_action)
  ) returning id into v_event_id;


  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id,
    'absence_id', v_absence_id,
    'event_id', v_event_id,
    'from_status', v_from_status,
    'to_status', v_to_status
  );
end;
$$;


ALTER FUNCTION "public"."save_absence_lifecycle"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_absence_id" "uuid", "p_action" "text", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_actuals_lifecycle"("p_restaurant_id" "uuid", "p_action" "text", "p_payload" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor record;
  v_actor_role text;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_reason text := btrim(coalesce(p_payload->>'reason', ''));
  v_employee_id uuid;
  v_entry_id uuid;
  v_business_date date;
  v_week_start date;
  v_service_key text;
  v_clock_in timestamptz;
  v_clock_out timestamptz;
  v_break_minutes integer;
  v_expected_revision bigint;
  v_entry public.time_entries%rowtype;
  v_after public.time_entries%rowtype;
  v_week public.work_weeks%rowtype;
  v_after_week public.work_weeks%rowtype;
  v_local_today date;
  v_timezone text;
  v_planned_shift_id uuid;
  v_new_status public.time_entry_status;
  v_actuals_snapshot jsonb;
begin
  select * into v_actor
  from public.require_owner_or_manager_context(p_restaurant_id)
  limit 1;
  v_actor_role := public.active_membership_role(
    p_restaurant_id,
    v_actor.profile_id
  );

  if v_action not in (
    'manual_entry', 'adjust_entry', 'cancel_entry',
    'approve_week', 'reopen_week'
  ) then
    raise exception 'Unsupported Timesheet action.';
  end if;
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'Timesheet payload must be an object.';
  end if;
  if length(v_reason) < 3 then
    raise exception 'A manager reason of at least 3 characters is required.';
  end if;

  select coalesce(nullif(btrim(s.timezone), ''), 'Europe/Brussels')
  into v_timezone
  from public.restaurant_settings s
  where s.restaurant_id = p_restaurant_id;
  v_timezone := coalesce(v_timezone, 'Europe/Brussels');
  v_local_today := (now() at time zone v_timezone)::date;

  if v_action in ('manual_entry', 'adjust_entry', 'cancel_entry') then
    v_entry_id := nullif(p_payload->>'time_entry_id', '')::uuid;

    if v_action in ('adjust_entry', 'cancel_entry') then
      if v_entry_id is null then
        raise exception 'A time entry is required.';
      end if;
      v_expected_revision := nullif(p_payload->>'expected_revision', '')::bigint;
      if v_expected_revision is null then
        raise exception 'CONFLICT: Time-entry revision is required. Reload before saving.';
      end if;

      select * into v_entry
      from public.time_entries t
      where t.restaurant_id = p_restaurant_id
        and t.id = v_entry_id
      for update;

      if v_entry.id is null then raise exception 'Time entry not found.'; end if;
      if v_entry.status = 'cancelled' then
        raise exception 'Cancelled time entries cannot be changed.';
      end if;
      if v_entry.revision <> v_expected_revision then
        raise exception 'CONFLICT: This time entry changed in another session. Reload before saving.';
      end if;

      v_employee_id := v_entry.employee_id;
      v_business_date := v_entry.business_date;
      v_service_key := v_entry.service_key;
    else
      v_employee_id := nullif(p_payload->>'employee_id', '')::uuid;
      v_business_date := nullif(p_payload->>'business_date', '')::date;
      v_service_key := lower(btrim(coalesce(p_payload->>'service_key', '')));

      if v_employee_id is null or v_business_date is null then
        raise exception 'Employee and business date are required.';
      end if;
      if not exists (
        select 1
        from public.employees e
        where e.restaurant_id = p_restaurant_id
          and e.id = v_employee_id
          and e.active
      ) then
        raise exception 'Active employee required.';
      end if;
      if not exists (
        select 1
        from public.services s
        where s.restaurant_id = p_restaurant_id
          and s.service_key = v_service_key
          and s.active
      ) then
        raise exception 'Select an active service.';
      end if;
      if exists (
        select 1
        from public.time_entries t
        where t.restaurant_id = p_restaurant_id
          and t.employee_id = v_employee_id
          and t.business_date = v_business_date
          and t.service_key = v_service_key
          and t.status <> 'cancelled'
      ) then
        raise exception 'An active time entry already exists for this employee and service.';
      end if;
    end if;

    if v_business_date > v_local_today then
      raise exception 'Worked time cannot be recorded in the future.';
    end if;

    v_week_start := public.week_start_for_date(v_business_date);
    perform pg_advisory_xact_lock(
      hashtextextended(
        p_restaurant_id::text || ':actuals:' || v_week_start::text,
        0
      )
    );

    insert into public.work_weeks (
      restaurant_id, week_start, planning_status, actuals_status
    )
    values (p_restaurant_id, v_week_start, 'draft', 'open')
    on conflict (restaurant_id, week_start) do nothing;

    select * into v_week
    from public.work_weeks w
    where w.restaurant_id = p_restaurant_id
      and w.week_start = v_week_start
    for update;

    if v_week.actuals_status in ('approved', 'locked') then
      raise exception 'Reopen this Timesheet week before changing worked time.';
    end if;

    if v_action = 'cancel_entry' then
      update public.time_entries
      set status = 'cancelled',
          cancellation_reason = v_reason,
          cancelled_at = now(),
          cancelled_by_profile_id = v_actor.profile_id,
          updated_at = now()
      where restaurant_id = p_restaurant_id and id = v_entry.id
      returning * into v_after;

      insert into public.time_entry_adjustments (
        restaurant_id, time_entry_id, employee_id, business_date,
        service_key, action, previous_values, new_values, reason,
        actor_profile_id, actor_employee_id, actor_role
      )
      values (
        p_restaurant_id, v_entry.id, v_entry.employee_id,
        v_entry.business_date, v_entry.service_key, 'cancel_entry',
        jsonb_build_object(
          'revision', v_entry.revision,
          'clock_in_at', v_entry.clock_in_at,
          'clock_out_at', v_entry.clock_out_at,
          'break_minutes', v_entry.break_minutes,
          'status', v_entry.status,
          'updated_at', v_entry.updated_at
        ),
        jsonb_build_object(
          'revision', v_after.revision,
          'clock_in_at', v_after.clock_in_at,
          'clock_out_at', v_after.clock_out_at,
          'break_minutes', v_after.break_minutes,
          'status', v_after.status,
          'updated_at', v_after.updated_at
        ),
        v_reason,
        v_actor.profile_id, v_actor.employee_id, v_actor_role
      );
    else
      v_clock_in := nullif(p_payload->>'clock_in_at', '')::timestamptz;
      v_clock_out := nullif(p_payload->>'clock_out_at', '')::timestamptz;
      v_break_minutes := coalesce(
        nullif(p_payload->>'break_minutes', '')::integer,
        case when v_action = 'adjust_entry' then v_entry.break_minutes else 0 end
      );

      if v_clock_in is null then raise exception 'Clock-in is required.'; end if;
      if v_clock_out is not null and v_clock_out <= v_clock_in then
        raise exception 'Clock-out must be after clock-in.';
      end if;
      if v_break_minutes < 0 then raise exception 'Break cannot be negative.'; end if;
      if v_clock_out is null and v_break_minutes > 0 then
        raise exception 'A break can only be recorded after clock-out.';
      end if;
      if v_clock_out is not null
          and v_clock_out - v_clock_in > interval '36 hours' then
        raise exception 'A time entry cannot exceed 36 hours.';
      end if;
      if v_clock_out is not null
          and v_break_minutes >= extract(epoch from (v_clock_out - v_clock_in)) / 60 then
        raise exception 'Break must be shorter than the worked interval.';
      end if;

      v_new_status := case
        when v_clock_out is null then 'open'::public.time_entry_status
        else 'adjusted'::public.time_entry_status
      end;

      if v_action = 'manual_entry' then
        select p.id into v_planned_shift_id
        from public.planned_shifts p
        where p.restaurant_id = p_restaurant_id
          and p.week_start = v_week_start
          and p.employee_id = v_employee_id
          and p.weekday = extract(isodow from v_business_date)
          and p.service_key = v_service_key
        limit 1;

        insert into public.time_entries (
          restaurant_id, employee_id, business_date, service_key,
          planned_shift_id, clock_in_at, clock_out_at, break_minutes,
          source, status, adjusted_at, adjusted_by_profile_id,
          adjustment_reason
        )
        values (
          p_restaurant_id, v_employee_id, v_business_date, v_service_key,
          v_planned_shift_id, v_clock_in, v_clock_out, v_break_minutes,
          'manager_manual', v_new_status, now(), v_actor.profile_id, v_reason
        )
        returning * into v_after;

        insert into public.time_entry_adjustments (
          restaurant_id, time_entry_id, employee_id, business_date,
          service_key, action, previous_values, new_values, reason,
          actor_profile_id, actor_employee_id, actor_role
        )
        values (
          p_restaurant_id, v_after.id, v_after.employee_id,
          v_after.business_date, v_after.service_key, 'manual_entry',
          '{}'::jsonb,
          jsonb_build_object(
            'revision', v_after.revision,
            'clock_in_at', v_after.clock_in_at,
            'clock_out_at', v_after.clock_out_at,
            'break_minutes', v_after.break_minutes,
            'status', v_after.status,
            'source', v_after.source,
            'updated_at', v_after.updated_at
          ),
          v_reason,
          v_actor.profile_id, v_actor.employee_id, v_actor_role
        );
      else
        update public.time_entries
        set clock_in_at = v_clock_in,
            clock_out_at = v_clock_out,
            break_minutes = v_break_minutes,
            status = v_new_status,
            adjusted_at = now(),
            adjusted_by_profile_id = v_actor.profile_id,
            adjustment_reason = v_reason,
            updated_at = now()
        where restaurant_id = p_restaurant_id and id = v_entry.id
        returning * into v_after;

        insert into public.time_entry_adjustments (
          restaurant_id, time_entry_id, employee_id, business_date,
          service_key, action, previous_values, new_values, reason,
          actor_profile_id, actor_employee_id, actor_role
        )
        values (
          p_restaurant_id, v_entry.id, v_entry.employee_id,
          v_entry.business_date, v_entry.service_key, 'adjust_entry',
          jsonb_build_object(
            'revision', v_entry.revision,
            'clock_in_at', v_entry.clock_in_at,
            'clock_out_at', v_entry.clock_out_at,
            'break_minutes', v_entry.break_minutes,
            'status', v_entry.status,
            'updated_at', v_entry.updated_at
          ),
          jsonb_build_object(
            'revision', v_after.revision,
            'clock_in_at', v_after.clock_in_at,
            'clock_out_at', v_after.clock_out_at,
            'break_minutes', v_after.break_minutes,
            'status', v_after.status,
            'updated_at', v_after.updated_at
          ),
          v_reason,
          v_actor.profile_id, v_actor.employee_id, v_actor_role
        );
      end if;
    end if;
  else
    v_week_start := nullif(p_payload->>'week_start', '')::date;
    if v_week_start is null or extract(isodow from v_week_start) <> 1 then
      raise exception 'Timesheet week must start on Monday.';
    end if;
    v_expected_revision := nullif(p_payload->>'expected_revision', '')::bigint;
    if v_expected_revision is null then
      raise exception 'CONFLICT: Timesheet revision is required. Reload before continuing.';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(
        p_restaurant_id::text || ':actuals:' || v_week_start::text,
        0
      )
    );

    select * into v_week
    from public.work_weeks w
    where w.restaurant_id = p_restaurant_id
      and w.week_start = v_week_start
    for update;

    if v_week.restaurant_id is null then
      if v_expected_revision <> 0 then
        raise exception 'CONFLICT: This Timesheet week no longer matches the current state.';
      end if;
      insert into public.work_weeks (
        restaurant_id, week_start, planning_status, actuals_status
      )
      values (p_restaurant_id, v_week_start, 'draft', 'open')
      returning * into v_week;
    elsif v_week.actuals_revision <> v_expected_revision then
      raise exception 'CONFLICT: This Timesheet week changed in another session. Reload before continuing.';
    end if;

    if v_action = 'approve_week' then
      if v_week.actuals_status <> 'open' then
        raise exception 'Only an open Timesheet week can be approved.';
      end if;
      v_actuals_snapshot := public.actuals_snapshot_for_week(
        p_restaurant_id,
        v_week_start
      );

      update public.work_weeks
      set actuals_status = 'approved',
          actuals_approved_at = now(),
          actuals_approved_by_profile_id = v_actor.profile_id,
          actuals_reopened_at = null,
          actuals_reopened_by_profile_id = null,
          actuals_revision = actuals_revision + 1,
          updated_at = now()
      where restaurant_id = p_restaurant_id
        and week_start = v_week_start
      returning * into v_after_week;

      insert into public.work_week_events (
        restaurant_id, week_start, event_type, actor_profile_id,
        actor_employee_id, actor_role, reason, previous_values,
        new_values, metadata
      )
      values (
        p_restaurant_id, v_week_start, 'actuals_approved',
        v_actor.profile_id, v_actor.employee_id, v_actor_role, v_reason,
        jsonb_build_object(
          'actuals_status', v_week.actuals_status,
          'actuals_revision', v_week.actuals_revision
        ),
        jsonb_build_object(
          'actuals_status', 'approved',
          'actuals_revision', v_after_week.actuals_revision,
          'actuals', v_actuals_snapshot
        ),
        jsonb_build_object(
          'entry_count', v_actuals_snapshot->'entry_count',
          'worked_minutes', v_actuals_snapshot->'worked_minutes'
        )
      );
    else
      if v_week.actuals_status <> 'approved' then
        raise exception 'Only an approved Timesheet week can be reopened.';
      end if;
      v_actuals_snapshot := public.actuals_snapshot_for_week(
        p_restaurant_id,
        v_week_start
      );

      update public.work_weeks
      set actuals_status = 'open',
          actuals_reopened_at = now(),
          actuals_reopened_by_profile_id = v_actor.profile_id,
          actuals_revision = actuals_revision + 1,
          updated_at = now()
      where restaurant_id = p_restaurant_id
        and week_start = v_week_start
      returning * into v_after_week;

      insert into public.work_week_events (
        restaurant_id, week_start, event_type, actor_profile_id,
        actor_employee_id, actor_role, reason, previous_values,
        new_values, metadata
      )
      values (
        p_restaurant_id, v_week_start, 'actuals_reopened',
        v_actor.profile_id, v_actor.employee_id, v_actor_role, v_reason,
        jsonb_build_object(
          'actuals_status', v_week.actuals_status,
          'actuals_revision', v_week.actuals_revision,
          'approved_actuals', v_actuals_snapshot
        ),
        jsonb_build_object(
          'actuals_status', 'open',
          'actuals_revision', v_after_week.actuals_revision
        ),
        '{}'::jsonb
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id
  );
end
$$;


ALTER FUNCTION "public"."save_actuals_lifecycle"("p_restaurant_id" "uuid", "p_action" "text", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_employee_availability"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_availability" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_mode public.work_regime;
  v_today date;
  v_from_date date;
  v_week_start date;
  v_item jsonb;
  v_date date;
  v_service_key text;
  v_state text;
  v_slot_key text;
  v_slots jsonb := '{}'::jsonb;
begin
  if v_profile_id is null then
    raise exception 'Authenticated session required.';
  end if;
  if jsonb_typeof(coalesce(p_availability, '[]'::jsonb)) <> 'array' then
    raise exception 'Availability must be a JSON array.';
  end if;
  if not exists (
    select 1
    from public.employee_access ea
    join public.restaurant_memberships m
      on m.restaurant_id = ea.restaurant_id
     and m.profile_id = ea.profile_id
     and m.status = 'active'
    where ea.restaurant_id = p_restaurant_id
      and ea.employee_id = p_employee_id
      and ea.profile_id = v_profile_id
      and ea.access_status = 'active'
  ) then
    raise exception 'Employee self-service access required.';
  end if;

  select coalesce(c.work_regime, 'weekly_availability'::public.work_regime)
  into v_mode
  from public.employee_contracts c
  where c.restaurant_id = p_restaurant_id
    and c.employee_id = p_employee_id
    and c.active
    and c.is_current
  order by c.created_at desc
  limit 1;

  v_mode := coalesce(v_mode, 'weekly_availability'::public.work_regime);
  if v_mode <> 'weekly_availability'::public.work_regime then
    raise exception 'Weekly availability is not enabled for this employee.';
  end if;

  select (now() at time zone coalesce(rs.timezone, 'Europe/Brussels'))::date
  into v_today
  from public.restaurant_settings rs
  where rs.restaurant_id = p_restaurant_id;
  v_today := coalesce(v_today, current_date);

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_availability, '[]'::jsonb))
  loop
    v_date := nullif(v_item->>'date', '')::date;
    v_service_key := lower(btrim(coalesce(v_item->>'service_key', '')));
    v_state := lower(btrim(coalesce(v_item->>'availability_state', '')));

    if v_date is null then raise exception 'Availability date is required.'; end if;
    if v_date < v_today then raise exception 'Past availability is read-only.'; end if;
    if v_service_key not in ('lunch', 'evening') then
      raise exception 'Invalid service.';
    end if;
    if v_state not in ('', 'available', 'partial', 'unavailable') then
      raise exception 'Invalid availability state.';
    end if;

    v_slot_key := v_date::text || '|' || v_service_key;
    v_slots := jsonb_set(
      v_slots,
      array[v_slot_key],
      jsonb_build_object(
        'date', v_date,
        'service_key', v_service_key,
        'availability_state', nullif(v_state, '')
      ),
      true
    );
  end loop;

  select    min((slot.value->>'date')::date)
  into v_from_date
  from jsonb_each(v_slots) slot;

  if v_from_date is null then
    raise exception 'Choose at least one availability slot.';
  end if;

  for v_week_start in
    select distinct public.week_start_for_date((slot.value->>'date')::date)
    from jsonb_each(v_slots) slot
  loop
    if exists (
      select 1
      from public.work_weeks ww
      where ww.restaurant_id = p_restaurant_id
        and ww.week_start = v_week_start
        and ww.planning_status = 'published'
    ) then
      raise exception 'Availability is locked once the week is published.';
    end if;

    insert into public.work_weeks (restaurant_id, week_start)
    values (p_restaurant_id, v_week_start)
    on conflict (restaurant_id, week_start) do nothing;

    delete from public.employee_availability_slots av
    where av.restaurant_id = p_restaurant_id
      and av.employee_id = p_employee_id
      and av.week_start = v_week_start;
  end loop;

  insert into public.employee_availability_slots (
    restaurant_id,
    employee_id,
    week_start,
    weekday,
    service_key,
    availability_state
  )
  select
    p_restaurant_id,
    p_employee_id,
    public.week_start_for_date((slot.value->>'date')::date),
    extract(isodow from (slot.value->>'date')::date)::smallint,
    slot.value->>'service_key',
    (slot.value->>'availability_state')::public.service_availability_state
  from jsonb_each(v_slots) slot
  where nullif(slot.value->>'availability_state', '') is not null;

  insert into public.employee_availability_submissions (
    restaurant_id,
    employee_id,
    week_start,
    status,
    submitted_at
  )
  select distinct
    p_restaurant_id,
    p_employee_id,
    public.week_start_for_date((slot.value->>'date')::date),
    'submitted'::public.availability_submission_status,
    now()
  from jsonb_each(v_slots) slot
  on conflict (restaurant_id, employee_id, week_start) do update
    set status = excluded.status,
        submitted_at = excluded.submitted_at,
        updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id
  );
end
$$;


ALTER FUNCTION "public"."save_employee_availability"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_availability" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_manager_planning"("p_restaurant_id" "uuid", "p_week_start" "date", "p_planning_status" "text" DEFAULT 'draft'::"text", "p_planned_shifts" "jsonb" DEFAULT '[]'::"jsonb", "p_weekly_notes" "jsonb" DEFAULT '[]'::"jsonb", "p_expected_revision" bigint DEFAULT NULL::bigint, "p_reason" "text" DEFAULT NULL::"text", "p_allow_coverage_gaps" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor record;
  v_current public.work_weeks%rowtype;
  v_status_text text := lower(btrim(coalesce(p_planning_status, 'draft')));
  v_status public.planning_status;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_timezone text;
  v_local_week date;
  v_previous_snapshot jsonb;
  v_new_snapshot jsonb;
  v_issues jsonb;
  v_next_revision bigint;
begin
  select * into v_actor
  from public.require_owner_or_manager_context(p_restaurant_id)
  limit 1;

  if p_week_start is null or extract(isodow from p_week_start) <> 1 then
    raise exception 'Schedule week must start on Monday.';
  end if;
  if jsonb_typeof(coalesce(p_planned_shifts, '[]'::jsonb)) <> 'array'
      or jsonb_typeof(coalesce(p_weekly_notes, '[]'::jsonb)) <> 'array' then
    raise exception 'Schedule shifts and notes must be arrays.';
  end if;
  if v_status_text not in ('draft', 'published') then
    raise exception 'Invalid planning status.';
  end if;
  v_status := v_status_text::public.planning_status;

  select coalesce(nullif(btrim(s.timezone), ''), 'Europe/Brussels')
  into v_timezone
  from public.restaurant_settings s
  where s.restaurant_id = p_restaurant_id;
  v_local_week := public.week_start_for_date(
    (now() at time zone coalesce(v_timezone, 'Europe/Brussels'))::date
  );
  if p_week_start < v_local_week then
    raise exception 'Past planning weeks are locked.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_restaurant_id::text || ':planning:' || p_week_start::text,
      0
    )
  );

  select * into v_current
  from public.work_weeks w
  where w.restaurant_id = p_restaurant_id
    and w.week_start = p_week_start
  for update;

  if v_current.restaurant_id is not null then
    if p_expected_revision is null then
      raise exception 'CONFLICT: Schedule revision is required. Reload before saving.';
    end if;
    if v_current.planning_revision <> p_expected_revision then
      raise exception 'CONFLICT: This planning week changed in another session. Reload before saving.';
    end if;
    if v_current.actuals_status in ('approved', 'locked') then
      raise exception 'Schedule is locked because Timesheet are %.', v_current.actuals_status;
    end if;
    if v_current.planning_status = 'published' and v_status = 'published' then
      raise exception 'Revert the published plan to draft before changing it.';
    end if;
  elsif p_expected_revision is not null and p_expected_revision <> 0 then
    raise exception 'CONFLICT: This planning week no longer matches the current state.';
  end if;

  if exists (
    select 1
    from (
      select
        nullif(value->>'employee_id', '')::uuid as employee_id,
        nullif(value->>'weekday', '')::smallint as weekday,
        lower(btrim(value->>'service_key')) as service_key,
        count(*) as duplicates
      from jsonb_array_elements(coalesce(p_planned_shifts, '[]'::jsonb))
      group by 1, 2, 3
      having count(*) > 1
    ) duplicate_slots
  ) then
    raise exception 'An employee can have only one shift per service slot.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_planned_shifts, '[]'::jsonb)) item
    left join public.employees e
      on e.restaurant_id = p_restaurant_id
     and e.id = nullif(item->>'employee_id', '')::uuid
     and e.active
    left join public.services s
      on s.restaurant_id = p_restaurant_id
     and s.service_key = lower(btrim(item->>'service_key'))
     and s.active
    where e.id is null
       or s.service_key is null
       or nullif(item->>'weekday', '')::smallint not between 1 and 7
  ) then
    raise exception 'Schedule contains an invalid employee, weekday or service.';
  end if;

  if v_status = 'published' then
    if length(v_reason) < 3 then
      raise exception 'A publication reason of at least 3 characters is required.';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(coalesce(p_planned_shifts, '[]'::jsonb)) item
      left join public.work_areas a
        on a.restaurant_id = p_restaurant_id
       and a.id = nullif(item->>'area_id', '')::uuid
       and a.active
      left join public.job_functions j
        on j.restaurant_id = p_restaurant_id
       and j.id = nullif(item->>'job_function_id', '')::uuid
       and j.active
      left join public.employee_job_functions assignment
        on assignment.restaurant_id = p_restaurant_id
       and assignment.employee_id = nullif(item->>'employee_id', '')::uuid
       and assignment.job_function_id = nullif(item->>'job_function_id', '')::uuid
       and assignment.active
      left join public.opening_hours o
        on o.restaurant_id = p_restaurant_id
       and o.weekday = nullif(item->>'weekday', '')::smallint
       and o.service_key = lower(btrim(item->>'service_key'))
       and o.is_open
      where a.id is null
         or j.id is null
         or assignment.employee_id is null
         or o.id is null
         or nullif(item->>'starts_at', '')::time is null
         or nullif(item->>'ends_at', '')::time is null
         or nullif(item->>'starts_at', '')::time
              = nullif(item->>'ends_at', '')::time
    ) then
      raise exception 'Published shifts require an open service, active area, assigned position and valid times.';
    end if;

    v_issues := public.planning_publish_issues(
      p_restaurant_id,
      p_week_start,
      p_planned_shifts
    );
    if exists (
      select 1
      from jsonb_array_elements(v_issues) issue
      where issue->>'kind' <> 'coverage_gap'
    ) then
      raise exception 'Resolve planning conflicts before publishing.';
    end if;
    if not p_allow_coverage_gaps and exists (
      select 1
      from jsonb_array_elements(v_issues) issue
      where issue->>'kind' = 'coverage_gap'
    ) then
      raise exception 'Review or confirm coverage gaps before publishing.';
    end if;
  elsif v_current.planning_status = 'published' and length(v_reason) < 3 then
    raise exception 'A revert reason of at least 3 characters is required.';
  end if;

  v_previous_snapshot := case
    when v_current.restaurant_id is null then
      jsonb_build_object('shifts', '[]'::jsonb, 'notes', '[]'::jsonb)
    else public.planning_snapshot_for_week(p_restaurant_id, p_week_start)
  end;
  v_next_revision := coalesce(v_current.planning_revision, 0) + 1;

  insert into public.work_weeks (
    restaurant_id,
    week_start,
    planning_status,
    published_at,
    published_by_profile_id,
    planning_revision
  )
  values (
    p_restaurant_id,
    p_week_start,
    v_status,
    case when v_status = 'published' then now() end,
    case when v_status = 'published' then v_actor.profile_id end,
    v_next_revision
  )
  on conflict (restaurant_id, week_start) do update set
    planning_status = excluded.planning_status,
    published_at = case
      when excluded.planning_status = 'published' then excluded.published_at
      when public.work_weeks.planning_status = 'published' then null
      else public.work_weeks.published_at
    end,
    published_by_profile_id = case
      when excluded.planning_status = 'published'
        then excluded.published_by_profile_id
      when public.work_weeks.planning_status = 'published' then null
      else public.work_weeks.published_by_profile_id
    end,
    planning_revision = excluded.planning_revision,
    updated_at = now();

  -- Reverting changes lifecycle state only. The published plan remains intact
  -- until the next explicit draft save.
  if not (
    v_current.restaurant_id is not null
    and v_current.planning_status = 'published'
    and v_status = 'draft'
  ) then
    insert into public.planned_shifts (
      restaurant_id,
      week_start,
      employee_id,
      weekday,
      service_key,
      area_id,
      job_function_id,
      starts_at,
      ends_at,
      source
    )
    select
      p_restaurant_id,
      p_week_start,
      nullif(value->>'employee_id', '')::uuid,
      nullif(value->>'weekday', '')::smallint,
      lower(btrim(value->>'service_key')),
      nullif(value->>'area_id', '')::uuid,
      nullif(value->>'job_function_id', '')::uuid,
      nullif(value->>'starts_at', '')::time,
      nullif(value->>'ends_at', '')::time,
      coalesce(
        nullif(value->>'source', ''),
        'manual'
      )::public.planned_shift_source
    from jsonb_array_elements(coalesce(p_planned_shifts, '[]'::jsonb))
    on conflict (
      restaurant_id, week_start, employee_id, weekday, service_key
    ) do update set
      area_id = excluded.area_id,
      job_function_id = excluded.job_function_id,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      source = excluded.source,
      updated_at = now();

    delete from public.planned_shifts existing
    where existing.restaurant_id = p_restaurant_id
      and existing.week_start = p_week_start
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_planned_shifts, '[]'::jsonb)) item
        where nullif(item->>'employee_id', '')::uuid = existing.employee_id
          and nullif(item->>'weekday', '')::smallint = existing.weekday
          and lower(btrim(item->>'service_key')) = existing.service_key
      );

    insert into public.weekly_notes (
      restaurant_id,
      week_start,
      weekday,
      service_key,
      note
    )
    select
      p_restaurant_id,
      p_week_start,
      nullif(value->>'weekday', '')::smallint,
      lower(btrim(value->>'service_key')),
      btrim(value->>'note')
    from jsonb_array_elements(coalesce(p_weekly_notes, '[]'::jsonb))
    where nullif(btrim(value->>'note'), '') is not null
    on conflict (
      restaurant_id, week_start, weekday, service_key
    ) do update set
      note = excluded.note,
      updated_at = now();

    delete from public.weekly_notes existing
    where existing.restaurant_id = p_restaurant_id
      and existing.week_start = p_week_start
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_weekly_notes, '[]'::jsonb)) item
        where nullif(item->>'weekday', '')::smallint = existing.weekday
          and lower(btrim(item->>'service_key')) = existing.service_key
          and nullif(btrim(item->>'note'), '') is not null
      );
  end if;

  v_new_snapshot := public.planning_snapshot_for_week(
    p_restaurant_id,
    p_week_start
  );

  if coalesce(v_current.planning_status, 'draft') <> v_status then
    insert into public.work_week_events (
      restaurant_id,
      week_start,
      event_type,
      actor_profile_id,
      actor_employee_id,
      actor_role,
      reason,
      previous_values,
      new_values,
      metadata
    )
    values (
      p_restaurant_id,
      p_week_start,
      case
        when v_status = 'published' then 'planning_published'
        else 'planning_reverted'
      end,
      v_actor.profile_id,
      v_actor.employee_id,
      public.active_membership_role(p_restaurant_id, v_actor.profile_id),
      v_reason,
      jsonb_build_object(
        'planning_status', coalesce(v_current.planning_status, 'draft'),
        'planning_revision', coalesce(v_current.planning_revision, 0),
        'planning', v_previous_snapshot
      ),
      jsonb_build_object(
        'planning_status', v_status,
        'planning_revision', v_next_revision,
        'planning', v_new_snapshot
      ),
      jsonb_build_object(
        'shift_count', jsonb_array_length(v_new_snapshot->'shifts'),
        'note_count', jsonb_array_length(v_new_snapshot->'notes'),
        'coverage_gap_count', case
          when v_status = 'published' then (
            select count(*)
            from jsonb_array_elements(coalesce(v_issues, '[]'::jsonb)) issue
            where issue->>'kind' = 'coverage_gap'
          )
          else 0
        end,
        'planning_conflict_count', case
          when v_status = 'published' then (
            select count(*)
            from jsonb_array_elements(coalesce(v_issues, '[]'::jsonb)) issue
            where issue->>'kind' <> 'coverage_gap'
          )
          else 0
        end
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id
  );
end
$$;


ALTER FUNCTION "public"."save_manager_planning"("p_restaurant_id" "uuid", "p_week_start" "date", "p_planning_status" "text", "p_planned_shifts" "jsonb", "p_weekly_notes" "jsonb", "p_expected_revision" bigint, "p_reason" "text", "p_allow_coverage_gaps" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_owner_onboarding_draft"("p_step" smallint, "p_draft" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_auth_user_id uuid := auth.uid();
begin
  if v_auth_user_id is null then raise exception 'Authentication required.'; end if;
  if p_step not between 0 and 7 then raise exception 'Invalid onboarding step.'; end if;
  if jsonb_typeof(coalesce(p_draft, '{}'::jsonb)) <> 'object' then
    raise exception 'Onboarding draft must be an object.';
  end if;

  insert into public.owner_onboarding_drafts (auth_user_id, step, draft)
  values (v_auth_user_id, p_step, p_draft)
  on conflict (auth_user_id) do update set
    step = excluded.step,
    draft = excluded.draft,
    updated_at = now();

  return jsonb_build_object('ok', true, 'step', p_step, 'updated_at', now());
end;
$$;


ALTER FUNCTION "public"."save_owner_onboarding_draft"("p_step" smallint, "p_draft" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_restaurant_model"("p_restaurant_id" "uuid", "p_restaurant" "jsonb" DEFAULT '{}'::"jsonb", "p_settings" "jsonb" DEFAULT '{}'::"jsonb", "p_job_functions" "jsonb" DEFAULT '[]'::"jsonb", "p_areas" "jsonb" DEFAULT '[]'::"jsonb", "p_opening_hours" "jsonb" DEFAULT '[]'::"jsonb", "p_area_service_defaults" "jsonb" DEFAULT '[]'::"jsonb", "p_coverage_requirements" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_item jsonb;
  v_id uuid;
  v_name text;
begin
  perform 1 from public.require_owner_context(p_restaurant_id);

  update public.restaurants set
    name = nullif(btrim(coalesce(p_restaurant->>'legal_name', p_restaurant->>'name', name)), ''),
    legal_name = nullif(btrim(coalesce(p_restaurant->>'legal_name', legal_name)), ''),
    company_number = nullif(btrim(p_restaurant->>'company_number'), ''),
    email = nullif(btrim(p_restaurant->>'email'), '')::citext,
    phone = nullif(btrim(p_restaurant->>'phone'), ''),
    address_line1 = nullif(btrim(p_restaurant->>'address_line1'), ''),
    postal_code = nullif(btrim(p_restaurant->>'postal_code'), ''),
    city = nullif(btrim(p_restaurant->>'city'), ''),
    country_code = 'BE',
    updated_at = now()
  where id = p_restaurant_id;

  insert into public.restaurant_settings (
    restaurant_id, timezone, locale, currency_code, active_week_start,
    week_start_weekday, settings, payroll_settings
  )
  values (
    p_restaurant_id, 'Europe/Brussels', 'fr-BE', 'EUR',
    nullif(p_settings->>'active_week_start', '')::date,
    1, coalesce(p_settings->'settings', '{}'::jsonb),
    coalesce(p_settings->'payroll_settings', '{}'::jsonb)
  )
  on conflict (restaurant_id) do update set
    timezone = 'Europe/Brussels', locale = 'fr-BE', currency_code = 'EUR',
    active_week_start = excluded.active_week_start,
    week_start_weekday = 1,
    settings = excluded.settings,
    payroll_settings = excluded.payroll_settings,
    updated_at = now();

  for v_item in select value from jsonb_array_elements(coalesce(p_job_functions, '[]')) loop
    v_id := (v_item->>'id')::uuid;
    v_name := nullif(btrim(v_item->>'name'), '');
    if v_id is null or v_name is null then raise exception 'Every position requires id and name.'; end if;
    insert into public.job_functions (
      id, restaurant_id, code, name, estimated_hourly_cost, active, sort_order, metadata
    )
    values (
      v_id, p_restaurant_id,
      coalesce(nullif(btrim(v_item->>'code'), ''), public.slugify_workspace(v_name)),
      v_name,
      greatest(0, coalesce(nullif(v_item->>'estimated_hourly_cost', '')::numeric, 0)),
      coalesce((v_item->>'active')::boolean, true),
      coalesce(nullif(v_item->>'sort_order', '')::integer, 0),
      coalesce(v_item->'metadata', '{}')
    )
    on conflict (restaurant_id, id) do update set
      code = excluded.code, name = excluded.name,
      estimated_hourly_cost = excluded.estimated_hourly_cost,
      active = excluded.active, sort_order = excluded.sort_order,
      metadata = excluded.metadata, updated_at = now();
  end loop;
  update public.job_functions set active = false, updated_at = now()
  where restaurant_id = p_restaurant_id
    and id not in (
      select (value->>'id')::uuid
      from jsonb_array_elements(coalesce(p_job_functions, '[]'))
    );

  for v_item in select value from jsonb_array_elements(coalesce(p_areas, '[]')) loop
    v_id := (v_item->>'id')::uuid;
    v_name := nullif(btrim(v_item->>'name'), '');
    if v_id is null or v_name is null then raise exception 'Every area requires id and name.'; end if;
    insert into public.work_areas (
      id, restaurant_id, code, name, notes, active, sort_order
    )
    values (
      v_id, p_restaurant_id,
      coalesce(nullif(btrim(v_item->>'code'), ''), public.slugify_workspace(v_name)),
      v_name,
      nullif(btrim(v_item->>'notes'), ''),
      coalesce((v_item->>'active')::boolean, true),
      coalesce(nullif(v_item->>'sort_order', '')::integer, 0)
    )
    on conflict (restaurant_id, id) do update set
      code = excluded.code, name = excluded.name, notes = excluded.notes,
      active = excluded.active, sort_order = excluded.sort_order, updated_at = now();
  end loop;
  update public.work_areas set active = false, updated_at = now()
  where restaurant_id = p_restaurant_id
    and id not in (
      select (value->>'id')::uuid
      from jsonb_array_elements(coalesce(p_areas, '[]'))
    );

  delete from public.opening_hours where restaurant_id = p_restaurant_id;
  insert into public.opening_hours (
    restaurant_id, weekday, service_key, is_open, opens_at, closes_at
  )
  select
    p_restaurant_id,
    (value->>'weekday')::smallint,
    value->>'service_key',
    coalesce((value->>'is_open')::boolean, false),
    nullif(value->>'opens_at', '')::time,
    nullif(value->>'closes_at', '')::time
  from jsonb_array_elements(coalesce(p_opening_hours, '[]'));

  delete from public.area_service_defaults where restaurant_id = p_restaurant_id;
  insert into public.area_service_defaults (
    restaurant_id, area_id, service_key, start_time, end_time
  )
  select
    p_restaurant_id,
    (value->>'area_id')::uuid,
    value->>'service_key',
    nullif(value->>'start_time', '')::time,
    nullif(value->>'end_time', '')::time
  from jsonb_array_elements(coalesce(p_area_service_defaults, '[]'));

  delete from public.coverage_requirements where restaurant_id = p_restaurant_id;
  insert into public.coverage_requirements (
    restaurant_id, area_id, job_function_id, service_key,
    coverage_scope, weekday, required_count, active, sort_order
  )
  select
    p_restaurant_id,
    (value->>'area_id')::uuid,
    (value->>'job_function_id')::uuid,
    value->>'service_key',
    coalesce(nullif(value->>'coverage_scope', ''), 'default'),
    nullif(value->>'weekday', '')::smallint,
    greatest(0, coalesce(nullif(value->>'required_count', '')::integer, 0)),
    coalesce((value->>'active')::boolean, true),
    coalesce(nullif(value->>'sort_order', '')::integer, 0)
  from jsonb_array_elements(coalesce(p_coverage_requirements, '[]'));

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id
  );
end;
$$;


ALTER FUNCTION "public"."save_restaurant_model"("p_restaurant_id" "uuid", "p_restaurant" "jsonb", "p_settings" "jsonb", "p_job_functions" "jsonb", "p_areas" "jsonb", "p_opening_hours" "jsonb", "p_area_service_defaults" "jsonb", "p_coverage_requirements" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_team_model"("p_restaurant_id" "uuid", "p_employees" "jsonb" DEFAULT '[]'::"jsonb", "p_employee_job_functions" "jsonb" DEFAULT '[]'::"jsonb", "p_recurring_schedule_slots" "jsonb" DEFAULT '[]'::"jsonb", "p_contacts" "jsonb" DEFAULT '[]'::"jsonb", "p_legal_profiles" "jsonb" DEFAULT '[]'::"jsonb", "p_contracts" "jsonb" DEFAULT '[]'::"jsonb", "p_payroll_profiles" "jsonb" DEFAULT '[]'::"jsonb", "p_access" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_item jsonb;
  v_employee_id uuid;
  v_contract_id uuid;
  v_existing public.employee_contracts%rowtype;
  v_owner boolean;
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);
  v_owner := public.is_owner(p_restaurant_id);

  for v_item in select value from jsonb_array_elements(coalesce(p_employees, '[]')) loop
    v_employee_id := (v_item->>'id')::uuid;
    insert into public.employees (
      id, restaurant_id, display_name, first_name, last_name, active, sort_order
    )
    values (
      v_employee_id, p_restaurant_id, btrim(v_item->>'display_name'),
      nullif(btrim(v_item->>'first_name'), ''), nullif(btrim(v_item->>'last_name'), ''),
      coalesce((v_item->>'active')::boolean, true),
      coalesce(nullif(v_item->>'sort_order', '')::integer, 0)
    )
    on conflict (restaurant_id, id) do update set
      display_name = excluded.display_name, first_name = excluded.first_name,
      last_name = excluded.last_name, active = excluded.active,
      sort_order = excluded.sort_order, updated_at = now();
  end loop;

  delete from public.employee_job_functions where restaurant_id = p_restaurant_id;
  insert into public.employee_job_functions (
    restaurant_id, employee_id, job_function_id, is_primary, active
  )
  select
    p_restaurant_id, (value->>'employee_id')::uuid,
    (value->>'job_function_id')::uuid,
    coalesce((value->>'is_primary')::boolean, false),
    coalesce((value->>'active')::boolean, true)
  from jsonb_array_elements(coalesce(p_employee_job_functions, '[]'));

  delete from public.recurring_schedule_slots where restaurant_id = p_restaurant_id;
  insert into public.recurring_schedule_slots (
    restaurant_id, employee_id, weekday, service_key, starts_at, ends_at, active
  )
  select
    p_restaurant_id, (value->>'employee_id')::uuid,
    (value->>'weekday')::smallint, value->>'service_key',
    nullif(value->>'starts_at', '')::time,
    nullif(value->>'ends_at', '')::time,
    coalesce((value->>'active')::boolean, true)
  from jsonb_array_elements(coalesce(p_recurring_schedule_slots, '[]'));

  for v_item in select value from jsonb_array_elements(coalesce(p_contacts, '[]')) loop
    v_employee_id := (v_item->>'employee_id')::uuid;
    insert into public.employee_contact_details (
      restaurant_id, employee_id, email, phone, mobile_phone, address_line1,
      postal_code, city, emergency_name, emergency_relation, emergency_phone, notes
    )
    values (
      p_restaurant_id, v_employee_id,
      nullif(btrim(v_item->>'email'), '')::citext,
      nullif(btrim(v_item->>'phone'), ''), nullif(btrim(v_item->>'mobile_phone'), ''),
      nullif(btrim(v_item->>'address_line1'), ''), nullif(btrim(v_item->>'postal_code'), ''),
      nullif(btrim(v_item->>'city'), ''), nullif(btrim(v_item->>'emergency_name'), ''),
      nullif(btrim(v_item->>'emergency_relation'), ''), nullif(btrim(v_item->>'emergency_phone'), ''),
      nullif(btrim(v_item->>'notes'), '')
    )
    on conflict (restaurant_id, employee_id) do update set
      email = excluded.email, phone = excluded.phone, mobile_phone = excluded.mobile_phone,
      address_line1 = excluded.address_line1, postal_code = excluded.postal_code,
      city = excluded.city, emergency_name = excluded.emergency_name,
      emergency_relation = excluded.emergency_relation,
      emergency_phone = excluded.emergency_phone, notes = excluded.notes,
      updated_at = now();
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_access, '[]')) loop
    v_employee_id := (v_item->>'employee_id')::uuid;
    insert into public.employee_access (
      restaurant_id, employee_id, access_status, badge_enabled
    )
    values (
      p_restaurant_id, v_employee_id, 'disabled',
      coalesce((v_item->>'badge_enabled')::boolean, false)
    )
    on conflict (restaurant_id, employee_id) do update set
      badge_enabled = excluded.badge_enabled,
      updated_at = now();
  end loop;

  if v_owner then
    for v_item in select value from jsonb_array_elements(coalesce(p_legal_profiles, '[]')) loop
      v_employee_id := (v_item->>'employee_id')::uuid;
      insert into public.employee_legal_profiles (
        restaurant_id, employee_id, birth_date, national_registry_number,
        sex, nationality, language
      )
      values (
        p_restaurant_id, v_employee_id,
        nullif(v_item->>'birth_date', '')::date,
        nullif(btrim(v_item->>'national_registry_number'), ''),
        nullif(btrim(v_item->>'sex'), ''), nullif(btrim(v_item->>'nationality'), ''),
        nullif(btrim(v_item->>'language'), '')
      )
      on conflict (restaurant_id, employee_id) do update set
        birth_date = excluded.birth_date,
        national_registry_number = excluded.national_registry_number,
        sex = excluded.sex, nationality = excluded.nationality,
        language = excluded.language, updated_at = now();
    end loop;

    for v_item in select value from jsonb_array_elements(coalesce(p_contracts, '[]')) loop
      v_employee_id := (v_item->>'employee_id')::uuid;
      v_contract_id := nullif(v_item->>'contract_id', '')::uuid;
      select * into v_existing from public.employee_contracts
      where restaurant_id = p_restaurant_id and id = v_contract_id;

      if v_existing.id is not null and (
        v_existing.contract_type_id is distinct from nullif(v_item->>'contract_type_id', '')::uuid or
        v_existing.work_regime is distinct from (v_item->>'work_regime')::public.work_regime or
        v_existing.contract_start is distinct from nullif(v_item->>'contract_start', '')::date or
        v_existing.contract_end is distinct from nullif(v_item->>'contract_end', '')::date or
        v_existing.weekly_contract_hours is distinct from greatest(0, coalesce(nullif(v_item->>'weekly_contract_hours', '')::numeric, 0)) or
        v_existing.contract_days is distinct from greatest(0, coalesce(nullif(v_item->>'contract_days', '')::numeric, 0))
      ) then
        update public.employee_contracts
        set is_current = false, active = false, updated_at = now()
        where id = v_existing.id;
        v_contract_id := null;
      end if;

      insert into public.employee_contracts (
        id, restaurant_id, employee_id, contract_type_id, work_regime,
        contract_start, contract_end, weekly_contract_hours, contract_days,
        annual_leave_entitlement_days, is_current, active
      )
      values (
        coalesce(v_contract_id, gen_random_uuid()), p_restaurant_id, v_employee_id,
        nullif(v_item->>'contract_type_id', '')::uuid,
        (v_item->>'work_regime')::public.work_regime,
        nullif(v_item->>'contract_start', '')::date,
        nullif(v_item->>'contract_end', '')::date,
        greatest(0, coalesce(nullif(v_item->>'weekly_contract_hours', '')::numeric, 0)),
        greatest(0, coalesce(nullif(v_item->>'contract_days', '')::numeric, 0)),
        greatest(0, coalesce(nullif(v_item->>'annual_leave_entitlement_days', '')::numeric, 0)),
        true, true
      )
      on conflict (id) do update set
        contract_type_id = excluded.contract_type_id,
        work_regime = excluded.work_regime,
        contract_start = excluded.contract_start,
        contract_end = excluded.contract_end,
        weekly_contract_hours = excluded.weekly_contract_hours,
        contract_days = excluded.contract_days,
        annual_leave_entitlement_days = excluded.annual_leave_entitlement_days,
        is_current = true, active = true, updated_at = now();
    end loop;

    for v_item in select value from jsonb_array_elements(coalesce(p_payroll_profiles, '[]')) loop
      v_employee_id := (v_item->>'employee_id')::uuid;
      insert into public.employee_payroll_profiles (
        restaurant_id, employee_id, external_employee_id, payroll_employee_id,
        iban, bic, hourly_wage_rate, estimated_hourly_cost,
        company_cost_formula, payroll_notes
      )
      values (
        p_restaurant_id, v_employee_id,
        nullif(btrim(v_item->>'external_employee_id'), ''),
        nullif(btrim(v_item->>'payroll_employee_id'), ''),
        nullif(btrim(v_item->>'iban'), ''), nullif(btrim(v_item->>'bic'), ''),
        greatest(0, coalesce(nullif(v_item->>'hourly_wage_rate', '')::numeric, 0)),
        greatest(0, coalesce(nullif(v_item->>'estimated_hourly_cost', '')::numeric, 0)),
        nullif(btrim(v_item->>'company_cost_formula'), ''),
        nullif(btrim(v_item->>'payroll_notes'), '')
      )
      on conflict (restaurant_id, employee_id) do update set
        external_employee_id = excluded.external_employee_id,
        payroll_employee_id = excluded.payroll_employee_id,
        iban = excluded.iban, bic = excluded.bic,
        hourly_wage_rate = excluded.hourly_wage_rate,
        estimated_hourly_cost = excluded.estimated_hourly_cost,
        company_cost_formula = excluded.company_cost_formula,
        payroll_notes = excluded.payroll_notes,
        updated_at = now();
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id
  );
end;
$$;


ALTER FUNCTION "public"."save_team_model"("p_restaurant_id" "uuid", "p_employees" "jsonb", "p_employee_job_functions" "jsonb", "p_recurring_schedule_slots" "jsonb", "p_contacts" "jsonb", "p_legal_profiles" "jsonb", "p_contracts" "jsonb", "p_payroll_profiles" "jsonb", "p_access" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_work_pattern_exception_lifecycle"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_work_pattern_exception_id" "uuid" DEFAULT NULL::"uuid", "p_action" "text" DEFAULT 'create_by_employee'::"text", "p_payload" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_actor record;
  v_actor_employee_id uuid;
  v_actor_role text;
  v_exception public.work_pattern_exceptions%rowtype;
  v_previous jsonb := '{}'::jsonb;
  v_start_date date;
  v_end_date date;
  v_service_key text;
  v_reason text;
  v_local_today date;
  v_work_regime text;
  v_event_type text;
begin
  if v_profile_id is null then raise exception 'Authenticated session required.'; end if;
  p_action := lower(btrim(coalesce(p_action, '')));

  select (now() at time zone coalesce(rs.timezone, 'Europe/Brussels'))::date
  into v_local_today
  from public.restaurant_settings rs
  where rs.restaurant_id = p_restaurant_id;
  v_local_today := coalesce(v_local_today, current_date);

  if p_action in ('create_by_manager', 'approve', 'reject', 'cancel_by_manager',
                  'cancel_for_planning', 'update_manager_comment') then
    select * into v_actor
    from public.require_owner_or_manager_context(p_restaurant_id)
    limit 1;
    v_actor_employee_id := v_actor.employee_id;
    v_actor_role := public.active_membership_role(p_restaurant_id, v_actor.profile_id);
  else
    select ea.employee_id, m.role
    into v_actor_employee_id, v_actor_role
    from public.restaurant_memberships m
    join public.employee_access ea
      on ea.restaurant_id = m.restaurant_id
      and ea.profile_id = m.profile_id
      and ea.access_status = 'active'
    where m.restaurant_id = p_restaurant_id
      and m.profile_id = v_profile_id
      and m.status = 'active'
      and ea.employee_id = p_employee_id
    limit 1;
    if v_actor_employee_id is null then
      raise exception 'Employees may only manage their own fixed-schedule changes.';
    end if;
  end if;

  if p_action in ('create_by_employee', 'create_by_manager') then
    perform 1 from public.employees
    where restaurant_id = p_restaurant_id and id = p_employee_id and active;
    if not found then raise exception 'Active employee required.'; end if;

    v_start_date := nullif(p_payload->>'start_date', '')::date;
    v_end_date := nullif(p_payload->>'end_date', '')::date;
    v_service_key := nullif(lower(btrim(p_payload->>'service_key')), '');
    v_reason := btrim(coalesce(p_payload->>'reason', p_payload->>'employee_comment', ''));
    if v_start_date is null or v_end_date is null or v_end_date < v_start_date then
      raise exception 'A valid exception date range is required.';
    end if;
    if p_action = 'create_by_employee' and v_start_date < v_local_today then
      raise exception 'Employees cannot request fixed-schedule changes in the past.';
    end if;
    if v_service_key is not null and v_service_key not in ('lunch', 'evening') then
      raise exception 'Invalid service.';
    end if;
    if length(v_reason) < 2 then raise exception 'An exception reason is required.'; end if;

    select c.work_regime::text into v_work_regime
    from public.employee_contracts c
    where c.restaurant_id = p_restaurant_id
      and c.employee_id = p_employee_id
      and c.active and c.is_current
    order by c.created_at desc
    limit 1;
    if coalesce(v_work_regime, 'manager_only') <> 'fixed_schedule' then
      raise exception 'Fixed-schedule changes are only available for fixed-schedule employees.';
    end if;

    if exists (
      select 1 from public.work_pattern_exceptions se
      where se.restaurant_id = p_restaurant_id
        and se.employee_id = p_employee_id
        and se.status in ('pending', 'approved')
        and se.start_date <= v_end_date
        and se.end_date >= v_start_date
        and (se.service_key is null or v_service_key is null or se.service_key = v_service_key)
    ) then
      raise exception 'An active fixed-schedule change already overlaps this period.';
    end if;

    insert into public.work_pattern_exceptions (
      restaurant_id, employee_id, start_date, end_date, service_key, status,
      reason, employee_comment, manager_comment, requested_by_profile_id,
      decided_by_profile_id, decided_at
    )
    values (
      p_restaurant_id, p_employee_id, v_start_date, v_end_date, v_service_key,
      (case when p_action = 'create_by_manager' then
        case when coalesce((p_payload->>'approve_immediately')::boolean, false)
          then 'approved' else 'pending' end
      else 'pending' end)::public.operational_request_status,
      v_reason,
      nullif(btrim(p_payload->>'employee_comment'), ''),
      nullif(btrim(p_payload->>'manager_comment'), ''),
      v_profile_id,
      case when p_action = 'create_by_manager'
             and coalesce((p_payload->>'approve_immediately')::boolean, false)
        then v_profile_id end,
      case when p_action = 'create_by_manager'
             and coalesce((p_payload->>'approve_immediately')::boolean, false)
        then now() end
    )
    returning * into v_exception;
    v_event_type := case when v_exception.status = 'approved'
      then 'created_approved' else 'requested' end;
  else
    select * into v_exception
    from public.work_pattern_exceptions
    where restaurant_id = p_restaurant_id
      and id = p_work_pattern_exception_id
      and employee_id = p_employee_id
    for update;
    if not found then raise exception 'Fixed-schedule change not found.'; end if;
    v_previous := to_jsonb(v_exception);

    if p_action = 'approve' then
      if v_exception.status <> 'pending' then raise exception 'Only pending exceptions can be approved.'; end if;
      update public.work_pattern_exceptions set
        status = 'approved',
        manager_comment = coalesce(nullif(btrim(p_payload->>'manager_comment'), ''), manager_comment),
        decided_by_profile_id = v_profile_id,
        decided_at = now(),
        updated_at = now()
      where id = v_exception.id returning * into v_exception;
      v_event_type := 'approved';
    elsif p_action = 'reject' then
      if v_exception.status <> 'pending' then raise exception 'Only pending exceptions can be rejected.'; end if;
      v_reason := btrim(coalesce(p_payload->>'reason', p_payload->>'manager_comment', ''));
      if length(v_reason) < 2 then raise exception 'A rejection reason is required.'; end if;
      update public.work_pattern_exceptions set
        status = 'rejected',
        manager_comment = v_reason,
        decided_by_profile_id = v_profile_id,
        decided_at = now(),
        updated_at = now()
      where id = v_exception.id returning * into v_exception;
      v_event_type := 'rejected';
    elsif p_action in ('cancel_by_employee', 'cancel_by_manager', 'cancel_for_planning') then
      if v_exception.status not in ('pending', 'approved') then
        raise exception 'Only active exceptions can be cancelled.';
      end if;
      if p_action = 'cancel_by_employee' and v_exception.employee_id <> v_actor_employee_id then
        raise exception 'Employees may only cancel their own fixed-schedule changes.';
      end if;
      v_reason := btrim(coalesce(p_payload->>'reason', p_payload->>'cancellation_reason', ''));
      if length(v_reason) < 2 then raise exception 'A cancellation reason is required.'; end if;
      update public.work_pattern_exceptions set
        status = 'cancelled',
        cancelled_by_profile_id = v_profile_id,
        cancelled_at = now(),
        cancellation_reason = v_reason,
        updated_at = now()
      where id = v_exception.id returning * into v_exception;
      v_event_type := case when p_action = 'cancel_for_planning'
        then 'cancelled_for_planning' else 'cancelled' end;
    elsif p_action = 'update_manager_comment' then
      update public.work_pattern_exceptions set
        manager_comment = nullif(btrim(p_payload->>'manager_comment'), ''),
        updated_at = now()
      where id = v_exception.id returning * into v_exception;
      v_event_type := 'manager_comment_updated';
    else
      raise exception 'Unsupported fixed-schedule change action.';
    end if;
  end if;

  insert into public.work_pattern_exception_events (
    restaurant_id, work_pattern_exception_id, employee_id, event_type,
    actor_profile_id, actor_employee_id, actor_role, reason,
    previous_values, new_values
  )
  values (
    p_restaurant_id, v_exception.id, v_exception.employee_id, v_event_type,
    v_profile_id, v_actor_employee_id, coalesce(v_actor_role, 'employee'),
    coalesce(nullif(v_reason, ''), v_exception.reason, v_event_type),
    v_previous, to_jsonb(v_exception)
  );

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id
  );
end;
$$;


ALTER FUNCTION "public"."save_work_pattern_exception_lifecycle"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_work_pattern_exception_id" "uuid", "p_action" "text", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."service_key_from_display"("value" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select case lower(trim(coalesce(value, '')))
    when 'lunch'    then 'lunch'
    when 'evening'  then 'evening'
    else null
  end;
$$;


ALTER FUNCTION "public"."service_key_from_display"("value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_employee_access_state"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_action" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor record;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_access public.employee_access%rowtype;
  v_target_role text;
  v_actor_role text;
begin
  select * into v_actor
  from public.require_owner_or_manager_context(p_restaurant_id)
  limit 1;
  v_actor_role := public.active_membership_role(
    p_restaurant_id,
    v_actor.profile_id
  );

  if v_action not in ('disable', 'restore') then
    raise exception 'Access action must be disable or restore.';
  end if;

  select * into v_access
  from public.employee_access ea
  where ea.restaurant_id = p_restaurant_id
    and ea.employee_id = p_employee_id
  for update;

  if v_access.id is null or v_access.profile_id is null then
    raise exception 'This employee does not have a linked account.';
  end if;

  select m.role into v_target_role
  from public.restaurant_memberships m
  where m.restaurant_id = p_restaurant_id
    and m.profile_id = v_access.profile_id
  for update;

  if v_target_role is null then
    raise exception 'The linked account membership is missing.';
  end if;
  if v_target_role = 'owner' then
    raise exception 'Owner access cannot be changed from Team.';
  end if;
  if v_target_role = 'manager' and v_actor_role <> 'owner' then
    raise exception 'Only an owner can manage manager access.';
  end if;

  update public.employee_access
  set access_status = case
        when v_action = 'restore' then 'active'
        else 'disabled'
      end,
      updated_at = now()
  where id = v_access.id;

  update public.restaurant_memberships
  set status = case
        when v_action = 'restore' then 'active'
        else 'disabled'
      end,
      updated_at = now()
  where restaurant_id = p_restaurant_id
    and profile_id = v_access.profile_id;

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id
  );
end
$$;


ALTER FUNCTION "public"."set_employee_access_state"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_action" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_notification_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_notification_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_own_pin"("p_new_pin" "text", "p_restaurant_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_profile_id    uuid := public.current_profile_id();
  v_pin           text := trim(coalesce(p_new_pin, ''));
  v_restaurant_id uuid := p_restaurant_id;
  v_access        record;
begin
  if v_profile_id is null then raise exception 'Authenticated session required.'; end if;
  if v_pin !~ '^[0-9]{4}$' then raise exception 'Choose a 4-digit PIN.'; end if;

  if v_restaurant_id is null then
    select ea.restaurant_id into v_restaurant_id
    from public.employee_access ea
    join public.restaurant_memberships m
      on m.restaurant_id = ea.restaurant_id
     and m.profile_id = ea.profile_id
     and m.status = 'active'
    where ea.profile_id = v_profile_id
      and ea.access_status = 'active'
    order by ea.created_at
    limit 1;
  end if;
  if v_restaurant_id is null then raise exception 'Workspace access denied.'; end if;

  select ea.restaurant_id, ea.employee_id, ea.access_status
    into v_access
  from public.employee_access ea
  join public.restaurant_memberships m
    on m.restaurant_id = ea.restaurant_id
   and m.profile_id = ea.profile_id
   and m.status = 'active'
  join public.employees e
    on e.restaurant_id = ea.restaurant_id
   and e.id = ea.employee_id
   and e.active = true
  where ea.restaurant_id = v_restaurant_id
    and ea.profile_id = v_profile_id
    and ea.access_status = 'active'
  limit 1;
  if v_access.employee_id is null then raise exception 'Active employee access required to set a badge PIN.'; end if;

  insert into public.employee_pin_credentials (restaurant_id, employee_id, pin_hash, pin_status, failed_attempts, locked_until, last_rotated_at)
  values (v_access.restaurant_id, v_access.employee_id, crypt(v_pin, gen_salt('bf')), 'active', 0, null, now())
  on conflict (restaurant_id, employee_id)
  do update set pin_hash = excluded.pin_hash, pin_status = 'active', failed_attempts = 0,
                locked_until = null, last_rotated_at = now(), updated_at = now();

  update public.employee_access
     set badge_enabled = true,
         updated_at = now()
   where restaurant_id = v_access.restaurant_id and employee_id = v_access.employee_id;

  return jsonb_build_object('ok', true, 'restaurant_id', v_access.restaurant_id, 'employee_id', v_access.employee_id);
end;
$_$;


ALTER FUNCTION "public"."set_own_pin"("p_new_pin" "text", "p_restaurant_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_own_pin"("p_new_pin" "text", "p_restaurant_id" "uuid") IS 'Authenticated self-service badge PIN rotation. App login remains Supabase email/password; PIN is only for Badge Terminal.';



CREATE OR REPLACE FUNCTION "public"."set_payroll_export_columns"("p_restaurant_id" "uuid", "p_columns" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_profile_id uuid := public.current_profile_id();
begin
  if v_profile_id is null then
    raise exception 'Authenticated session required.';
  end if;
  if not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can configure payroll export columns.';
  end if;
  if jsonb_typeof(p_columns) <> 'array' or jsonb_array_length(p_columns) = 0 then
    raise exception 'At least one export column is required.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(p_columns) as k(key)
    where public.payroll_export_field_label(k.key) is null
  ) then
    raise exception 'Unknown payroll export column requested.';
  end if;

  update public.restaurant_settings
  set payroll_export_columns = p_columns
  where restaurant_id = p_restaurant_id;

  return jsonb_build_object('ok', true, 'restaurant_id', p_restaurant_id, 'columns', p_columns);
end
$$;


ALTER FUNCTION "public"."set_payroll_export_columns"("p_restaurant_id" "uuid", "p_columns" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_updated_at"() IS 'Generic trigger function: sets NEW.updated_at = now().';



CREATE OR REPLACE FUNCTION "public"."setup_owner_workspace"("p_owner_first_name" "text", "p_owner_last_name" "text", "p_owner_email" "public"."citext", "p_restaurant_name" "text", "p_city" "text" DEFAULT ''::"text", "p_employees" "jsonb" DEFAULT '[]'::"jsonb", "p_opening_hours" "jsonb" DEFAULT '[]'::"jsonb", "p_areas" "jsonb" DEFAULT '[]'::"jsonb", "p_job_functions" "jsonb" DEFAULT '[]'::"jsonb", "p_coverage" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_auth_user uuid := auth.uid();
  v_profile_id uuid;
  v_restaurant_id uuid;
  v_item jsonb;
  v_employee_id uuid;
  v_owner_employee_id uuid;
  v_area_id uuid;
  v_job_id uuid;
  v_owner_job_id uuid;
begin
  if v_auth_user is null then raise exception 'Authentication required.'; end if;
  if lower(coalesce(auth.jwt()->>'email', '')) <> lower(p_owner_email::text) then
    raise exception 'Owner email must match the authenticated account.';
  end if;

  insert into public.profiles (auth_user_id, first_name, last_name, email)
  values (v_auth_user, btrim(p_owner_first_name), btrim(p_owner_last_name), p_owner_email)
  on conflict (email) do update set
    auth_user_id = excluded.auth_user_id,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    updated_at = now()
  returning id into v_profile_id;

  insert into public.restaurants (
    workspace_slug, name, legal_name, city, email, country_code, owner_profile_id
  )
  values (
    left(coalesce(nullif(public.slugify_workspace(p_restaurant_name), ''), 'restaurant'), 40) || '-' || left(replace(gen_random_uuid()::text, '-', ''), 12),
    btrim(p_restaurant_name), btrim(p_restaurant_name),
    nullif(btrim(p_city), ''), p_owner_email, 'BE', v_profile_id
  )
  returning id into v_restaurant_id;

  insert into public.restaurant_settings (
    restaurant_id, timezone, locale, currency_code, week_start_weekday
  )
  values (v_restaurant_id, 'Europe/Brussels', 'fr-BE', 'EUR', 1);

  insert into public.restaurant_onboarding_state (
    restaurant_id, state, last_step, workspace_created_at
  )
  values (v_restaurant_id, 'workspace_created', 'workspace_created', now());

  insert into public.restaurant_memberships (
    restaurant_id, profile_id, role, status
  )
  values (v_restaurant_id, v_profile_id, 'owner', 'active');

  insert into public.services (restaurant_id, service_key, name, sort_order)
  values
    (v_restaurant_id, 'lunch', 'Lunch', 10),
    (v_restaurant_id, 'evening', 'Evening', 20);

  for v_item in select value from jsonb_array_elements(coalesce(p_job_functions, '[]')) loop
    insert into public.job_functions (
      restaurant_id, code, name, estimated_hourly_cost, sort_order
    )
    values (
      v_restaurant_id,
      public.slugify_workspace(v_item #>> '{}'),
      v_item #>> '{}', 0, 10
    )
    returning id into v_job_id;
  end loop;

  if not exists (select 1 from public.job_functions where restaurant_id = v_restaurant_id) then
    insert into public.job_functions (restaurant_id, code, name, sort_order)
    values (v_restaurant_id, 'staff', 'Staff', 10);
  end if;

  insert into public.job_functions (restaurant_id, code, name, sort_order)
  values (v_restaurant_id, 'owner', 'Owner', 0)
  on conflict (restaurant_id, code) do update set
    name = excluded.name,
    sort_order = excluded.sort_order,
    active = true,
    updated_at = now()
  returning id into v_owner_job_id;

  insert into public.contract_types (
    restaurant_id, code, name, category, sort_order, active, metadata
  )
  values
    (v_restaurant_id, 'CDI', 'CDI', 'permanent', 10, true, '{"system":true}'),
    (v_restaurant_id, 'CDD', 'CDD', 'fixed_term', 20, true, '{"system":true}'),
    (v_restaurant_id, 'FLEXI', 'Flexi', 'flexi', 30, true, '{"system":true}'),
    (v_restaurant_id, 'STUDENT', 'Student', 'student', 40, true, '{"system":true}'),
    (v_restaurant_id, 'EXTRA', 'Extra', 'extra', 50, true, '{"system":true}'),
    (v_restaurant_id, 'FREELANCE', 'Freelance', 'self_employed', 60, true, '{"system":true}');

  insert into public.absence_types (
    restaurant_id, code, name, category, paid_policy, color,
    requires_approval, affects_planning, affects_payroll, sort_order, active, metadata
  )
  values
    (v_restaurant_id, 'HOLIDAY', 'Holiday', 'holiday', 'paid', '#22c55e', true, true, true, 10, true, '{"system":true}'),
    (v_restaurant_id, 'SICK', 'Sick leave', 'sick', 'paid', '#ef4444', true, true, true, 20, true, '{"system":true}'),
    (v_restaurant_id, 'UNPAID', 'Unpaid leave', 'unpaid', 'unpaid', '#f59e0b', true, true, true, 30, true, '{"system":true}'),
    (v_restaurant_id, 'PUBLIC_HOLIDAY', 'Public holiday', 'other', 'paid', '#38bdf8', false, true, true, 40, true, '{"system":true}'),
    (v_restaurant_id, 'OTHER', 'Other', 'other', 'neutral', '#94a3b8', true, true, true, 50, true, '{"system":true}');

  insert into public.employees (
    restaurant_id, display_name, first_name, last_name, sort_order
  )
  values (
    v_restaurant_id,
    btrim(p_owner_first_name || ' ' || p_owner_last_name),
    btrim(p_owner_first_name), btrim(p_owner_last_name), 0
  )
  returning id into v_owner_employee_id;

  insert into public.employee_access (
    restaurant_id, employee_id, profile_id, access_status, badge_enabled
  )
  values (v_restaurant_id, v_owner_employee_id, v_profile_id, 'active', true);

  v_job_id := v_owner_job_id;

  insert into public.employee_job_functions (
    restaurant_id, employee_id, job_function_id, is_primary
  )
  values (v_restaurant_id, v_owner_employee_id, v_job_id, true);

  for v_item in select value from jsonb_array_elements(coalesce(p_areas, '[]')) loop
    insert into public.work_areas (
      restaurant_id, code, name, sort_order
    )
    values (
      v_restaurant_id,
      public.slugify_workspace(v_item->>'name'),
      v_item->>'name', 10
    )
    returning id into v_area_id;

    insert into public.area_service_defaults (
      restaurant_id, area_id, service_key, start_time, end_time
    )
    values
      (v_restaurant_id, v_area_id, 'lunch', nullif(v_item->>'lunch_start', '')::time, nullif(v_item->>'lunch_end', '')::time),
      (v_restaurant_id, v_area_id, 'evening', nullif(v_item->>'evening_start', '')::time, nullif(v_item->>'evening_end', '')::time);
  end loop;

  insert into public.opening_hours (
    restaurant_id, weekday, service_key, is_open, opens_at, closes_at
  )
  select
    v_restaurant_id, (value->>'weekday')::smallint, value->>'service_key',
    coalesce((value->>'is_open')::boolean, false),
    nullif(value->>'opens_at', '')::time,
    nullif(value->>'closes_at', '')::time
  from jsonb_array_elements(coalesce(p_opening_hours, '[]'));

  for v_item in select value from jsonb_array_elements(coalesce(p_coverage, '[]')) loop
    select id into v_area_id from public.work_areas
    where restaurant_id = v_restaurant_id and name = v_item->>'area' limit 1;

    select id into v_job_id from public.job_functions
    where restaurant_id = v_restaurant_id and name = v_item->>'job_function' limit 1;

    if v_area_id is not null and v_job_id is not null then
      insert into public.coverage_requirements (
        restaurant_id, area_id, job_function_id, service_key,
        coverage_scope, required_count
      )
      values
        (v_restaurant_id, v_area_id, v_job_id, 'lunch', 'default', 1),
        (v_restaurant_id, v_area_id, v_job_id, 'evening', 'default', 1);
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_employees, '[]')) loop
    insert into public.employees (
      restaurant_id, display_name, first_name, last_name
    )
    values (
      v_restaurant_id, btrim(v_item->>'display_name'),
      nullif(btrim(v_item->>'first_name'), ''),
      nullif(btrim(v_item->>'last_name'), '')
    )
    returning id into v_employee_id;

    insert into public.employee_contact_details (
      restaurant_id, employee_id, email, phone, mobile_phone
    )
    values (
      v_restaurant_id, v_employee_id,
      nullif(btrim(v_item->>'email'), '')::citext,
      nullif(btrim(v_item->>'phone'), ''),
      nullif(btrim(v_item->>'phone'), '')
    );

    select id into v_job_id from public.job_functions
    where restaurant_id = v_restaurant_id
      and name = coalesce(nullif(v_item->>'job_function', ''), 'Staff')
    limit 1;

    if v_job_id is null then
      select id into v_job_id from public.job_functions
      where restaurant_id = v_restaurant_id order by sort_order, name limit 1;
    end if;

    insert into public.employee_job_functions (
      restaurant_id, employee_id, job_function_id, is_primary
    )
    values (v_restaurant_id, v_employee_id, v_job_id, true);

    insert into public.employee_access (
      restaurant_id, employee_id, access_status, badge_enabled
    )
    values (v_restaurant_id, v_employee_id, 'disabled', false);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', v_restaurant_id,
    'profile_id', v_profile_id,
    'role', 'owner'
  );
end;
$$;


ALTER FUNCTION "public"."setup_owner_workspace"("p_owner_first_name" "text", "p_owner_last_name" "text", "p_owner_email" "public"."citext", "p_restaurant_name" "text", "p_city" "text", "p_employees" "jsonb", "p_opening_hours" "jsonb", "p_areas" "jsonb", "p_job_functions" "jsonb", "p_coverage" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."slugify_workspace"("input" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $_$
  select regexp_replace(
           regexp_replace(
             lower(trim(coalesce(input, 'restaurant'))),
             '[^a-z0-9]+', '-', 'g'
           ),
           '(^-|-$)', '', 'g'
         )
$_$;


ALTER FUNCTION "public"."slugify_workspace"("input" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unique_workspace_slug"("base_name" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  base_slug text := public.slugify_workspace(base_name);
  candidate text;
  suffix    integer := 1;
begin
  if base_slug = '' then base_slug := 'restaurant'; end if;
  candidate := base_slug;
  while exists (select 1 from public.restaurants r where r.workspace_slug = candidate) loop
    suffix    := suffix + 1;
    candidate := base_slug || '-' || suffix::text;
  end loop;
  return candidate;
end;
$$;


ALTER FUNCTION "public"."unique_workspace_slug"("base_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_own_profile"("p_first_name" "text", "p_last_name" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_profile_id uuid := public.current_profile_id();
begin
  if v_profile_id is null then raise exception 'Authenticated profile required.'; end if;
  if nullif(btrim(p_first_name), '') is null
     or nullif(btrim(p_last_name), '') is null then
    raise exception 'First and last name are required.';
  end if;

  update public.profiles
  set first_name = btrim(p_first_name),
      last_name = btrim(p_last_name),
      updated_at = now()
  where id = v_profile_id;

  return jsonb_build_object(
    'ok', true,
    'profile_id', v_profile_id,
    'first_name', btrim(p_first_name),
    'last_name', btrim(p_last_name)
  );
end;
$$;


ALTER FUNCTION "public"."update_own_profile"("p_first_name" "text", "p_last_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_badge_pin"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_pin" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_actor record;
  v_credential record;
  v_failed integer;
  v_locked_until timestamptz;
  v_token uuid;
  v_expires timestamptz;
begin
  if trim(coalesce(p_pin, '')) !~ '^[0-9]{4}$' then
    raise exception 'Enter your 4-digit PIN.';
  end if;
  select * into v_actor
  from public.require_owner_or_manager_context(p_restaurant_id)
  limit 1;

  if not exists (
    select 1
    from public.employees e
    join public.employee_access ea
      on ea.restaurant_id = e.restaurant_id and ea.employee_id = e.id
    where e.restaurant_id = p_restaurant_id
      and e.id = p_employee_id
      and e.active
      and ea.access_status = 'active'
      and ea.badge_enabled
  ) then
    raise exception 'Employee badge access is not active.';
  end if;

  select * into v_credential
  from public.employee_pin_credentials pc
  where pc.restaurant_id = p_restaurant_id and pc.employee_id = p_employee_id
  limit 1
  for update;

  if v_credential.employee_id is null or v_credential.pin_status <> 'active' then
    raise exception 'PIN credential is not active for this employee.';
  end if;
  if v_credential.locked_until is not null and v_credential.locked_until > now() then
    return jsonb_build_object(
      'ok', false,
      'code', 'pin_locked',
      'message', 'PIN is temporarily locked. Try again later.',
      'locked_until', v_credential.locked_until
    );
  end if;

  if v_credential.pin_hash <> public.crypt(trim(p_pin), v_credential.pin_hash) then
    v_failed := coalesce(v_credential.failed_attempts, 0) + 1;
    v_locked_until := case when v_failed >= 5 then now() + interval '10 minutes' end;
    update public.employee_pin_credentials
    set failed_attempts = v_failed,
        locked_until = v_locked_until,
        updated_at = now()
    where restaurant_id = p_restaurant_id and employee_id = p_employee_id;
    return jsonb_build_object(
      'ok', false,
      'code', case when v_locked_until is null then 'wrong_pin' else 'pin_locked' end,
      'message', case when v_locked_until is null
        then 'Wrong PIN. Please try again.'
        else 'PIN is temporarily locked. Try again later.'
      end,
      'attempts_remaining', greatest(0, 5 - v_failed),
      'locked_until', v_locked_until
    );
  end if;

  update public.employee_pin_credentials
  set failed_attempts = 0, locked_until = null, updated_at = now()
  where restaurant_id = p_restaurant_id and employee_id = p_employee_id;

  delete from public.badge_verification_challenges
  where expires_at < now() - interval '1 hour'
     or used_at < now() - interval '1 hour';

  v_token := gen_random_uuid();
  v_expires := now() + interval '2 minutes';
  insert into public.badge_verification_challenges (
    restaurant_id, employee_id, actor_profile_id, token_hash, expires_at
  )
  values (
    p_restaurant_id,
    p_employee_id,
    v_actor.profile_id,
    encode(extensions.digest(v_token::text, 'sha256'), 'hex'),
    v_expires
  );

  return jsonb_build_object(
    'ok', true,
    'employee_id', p_employee_id,
    'badge_token', v_token,
    'expires_at', v_expires
  );
end;
$_$;


ALTER FUNCTION "public"."verify_badge_pin"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_pin" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."verify_badge_pin"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_pin" "text") IS 'Privacy helper: validates badge PIN/access before browser camera activation. Does not create a time entry.';



CREATE OR REPLACE FUNCTION "public"."week_start_for_date"("p_date" "date") RETURNS "date"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select (p_date - ((extract(isodow from p_date)::int - 1) * interval '1 day'))::date;
$$;


ALTER FUNCTION "public"."week_start_for_date"("p_date" "date") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."absence_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "absence_id" "uuid" NOT NULL,
    "actor_profile_id" "uuid",
    "actor_employee_id" "uuid",
    "actor_role" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "from_status" "public"."operational_request_status",
    "to_status" "public"."operational_request_status",
    "comment" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "absence_events_actor_role_check" CHECK (("actor_role" = ANY (ARRAY['owner'::"text", 'manager'::"text", 'employee'::"text", 'system'::"text"]))),
    CONSTRAINT "absence_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['requested'::"text", 'created_by_manager'::"text", 'approved'::"text", 'rejected'::"text", 'cancelled_by_employee'::"text", 'cancelled_by_manager'::"text", 'cancelled_from_planning'::"text", 'manager_comment_updated'::"text"])))
);


ALTER TABLE "public"."absence_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."absence_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "category" "text" NOT NULL,
    "paid_policy" "text" DEFAULT 'neutral'::"text" NOT NULL,
    "payroll_code" "text",
    "color" "text" DEFAULT '#94a3b8'::"text" NOT NULL,
    "requires_approval" boolean DEFAULT true NOT NULL,
    "affects_planning" boolean DEFAULT true NOT NULL,
    "affects_payroll" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "absence_types_category_check" CHECK (("category" = ANY (ARRAY['holiday'::"text", 'sick'::"text", 'unpaid'::"text", 'other'::"text"]))),
    CONSTRAINT "absence_types_color_hex_check" CHECK (("color" ~ '^#[0-9a-fA-F]{6}$'::"text"))
);


ALTER TABLE "public"."absence_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."absences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "absence_type_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "service_key" "text",
    "status" "public"."operational_request_status" DEFAULT 'pending'::"public"."operational_request_status" NOT NULL,
    "requested_by_profile_id" "uuid",
    "approved_by_profile_id" "uuid",
    "approved_at" timestamp with time zone,
    "rejected_by_profile_id" "uuid",
    "rejected_at" timestamp with time zone,
    "employee_comment" "text",
    "manager_comment" "text",
    "duration_days" numeric,
    "duration_hours" numeric,
    "payroll_export_status" "text" DEFAULT 'not_exported'::"text" NOT NULL,
    "payroll_export_id" "text",
    "cancelled_at" timestamp with time zone,
    "cancelled_by_profile_id" "uuid",
    "cancelled_by_role" "text",
    "cancellation_reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "absences_cancelled_by_role_check" CHECK ((("cancelled_by_role" IS NULL) OR ("cancelled_by_role" = ANY (ARRAY['owner'::"text", 'manager'::"text", 'employee'::"text", 'system'::"text"])))),
    CONSTRAINT "absences_date_range_check" CHECK (("end_date" >= "start_date")),
    CONSTRAINT "absences_duration_days_check" CHECK ((("duration_days" IS NULL) OR ("duration_days" >= (0)::numeric))),
    CONSTRAINT "absences_duration_hours_check" CHECK ((("duration_hours" IS NULL) OR ("duration_hours" >= (0)::numeric)))
);


ALTER TABLE "public"."absences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."area_service_defaults" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "area_id" "uuid" NOT NULL,
    "service_key" "text" NOT NULL,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."area_service_defaults" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."badge_verification_challenges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "actor_profile_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "badge_verification_challenges_expiry_check" CHECK (("expires_at" > "created_at")),
    CONSTRAINT "badge_verification_challenges_used_at_check" CHECK ((("used_at" IS NULL) OR ("used_at" >= "created_at")))
);


ALTER TABLE "public"."badge_verification_challenges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contract_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" DEFAULT 'other'::"text" NOT NULL,
    "payroll_code" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contract_types_category_check" CHECK (("category" = ANY (ARRAY['permanent'::"text", 'fixed_term'::"text", 'student'::"text", 'flexi'::"text", 'extra'::"text", 'interim'::"text", 'self_employed'::"text", 'other'::"text"]))),
    CONSTRAINT "contract_types_code_check" CHECK (("code" <> ''::"text"))
);


ALTER TABLE "public"."contract_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coverage_requirements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "job_function_id" "uuid" NOT NULL,
    "service_key" "text" NOT NULL,
    "coverage_scope" "text" DEFAULT 'default'::"text" NOT NULL,
    "weekday" smallint,
    "required_count" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "area_id" "uuid" NOT NULL,
    CONSTRAINT "coverage_requirements_required_count_check" CHECK (("required_count" >= 0)),
    CONSTRAINT "coverage_requirements_scope_check" CHECK (("coverage_scope" = ANY (ARRAY['default'::"text", 'weekday'::"text"]))),
    CONSTRAINT "coverage_requirements_scope_weekday_check" CHECK (((("coverage_scope" = 'default'::"text") AND ("weekday" IS NULL)) OR (("coverage_scope" = 'weekday'::"text") AND (("weekday" >= 1) AND ("weekday" <= 7)))))
);


ALTER TABLE "public"."coverage_requirements" OWNER TO "postgres";


COMMENT ON COLUMN "public"."coverage_requirements"."coverage_scope" IS 'default = applies across all weekdays; weekday = applies to the ISO weekday stored in weekday.';



COMMENT ON COLUMN "public"."coverage_requirements"."weekday" IS 'Null for default coverage; ISO weekday 1..7 when coverage_scope = weekday.';



CREATE TABLE IF NOT EXISTS "public"."employee_access" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "profile_id" "uuid",
    "access_status" "text" DEFAULT 'disabled'::"text" NOT NULL,
    "badge_enabled" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "employee_access_active_profile_check" CHECK ((("access_status" <> 'active'::"text") OR ("profile_id" IS NOT NULL))),
    CONSTRAINT "employee_access_status_check" CHECK (("access_status" = ANY (ARRAY['active'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."employee_access" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_availability_slots" (
    "restaurant_id" "uuid" NOT NULL,
    "week_start" "date" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "weekday" smallint NOT NULL,
    "service_key" "text" NOT NULL,
    "availability_state" "public"."service_availability_state" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "employee_availability_slots_weekday_check" CHECK ((("weekday" >= 1) AND ("weekday" <= 7)))
);


ALTER TABLE "public"."employee_availability_slots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_availability_submissions" (
    "restaurant_id" "uuid" NOT NULL,
    "week_start" "date" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "status" "public"."availability_submission_status" DEFAULT 'submitted'::"public"."availability_submission_status" NOT NULL,
    "submitted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."employee_availability_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_contact_details" (
    "restaurant_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "email" "public"."citext",
    "phone" "text",
    "mobile_phone" "text",
    "address_line1" "text",
    "postal_code" "text",
    "city" "text",
    "emergency_name" "text",
    "emergency_relation" "text",
    "emergency_phone" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."employee_contact_details" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_contracts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "contract_type_id" "uuid",
    "contract_start" "date",
    "contract_end" "date",
    "weekly_contract_hours" numeric DEFAULT 0 NOT NULL,
    "contract_days" numeric DEFAULT 0 NOT NULL,
    "annual_leave_entitlement_days" numeric DEFAULT 0 NOT NULL,
    "is_current" boolean DEFAULT true NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "work_regime" "public"."work_regime" DEFAULT 'weekly_availability'::"public"."work_regime" NOT NULL,
    CONSTRAINT "employee_contracts_contract_days_check" CHECK (("contract_days" >= (0)::numeric)),
    CONSTRAINT "employee_contracts_date_range_check" CHECK ((("contract_end" IS NULL) OR ("contract_end" >= "contract_start"))),
    CONSTRAINT "employee_contracts_leave_days_check" CHECK (("annual_leave_entitlement_days" >= (0)::numeric)),
    CONSTRAINT "employee_contracts_weekly_hours_check" CHECK (("weekly_contract_hours" >= (0)::numeric))
);


ALTER TABLE "public"."employee_contracts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."employee_contracts"."work_regime" IS 'Scheduling policy. Missing employment configuration defaults to weekly employee self-service; manager_only must be chosen explicitly.';



CREATE TABLE IF NOT EXISTS "public"."employee_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "email" "public"."citext" NOT NULL,
    "invited_role" "text" NOT NULL,
    "token_hash" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "invited_by_profile_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_by_profile_id" "uuid",
    "revoked_by_profile_id" "uuid",
    "revoked_reason" "text",
    CONSTRAINT "employee_invitations_email_normalized" CHECK ((("email")::"text" = "lower"("btrim"(("email")::"text")))),
    CONSTRAINT "employee_invitations_email_not_blank" CHECK (("btrim"(("email")::"text") <> ''::"text")),
    CONSTRAINT "employee_invitations_expiry_check" CHECK (("expires_at" > "sent_at")),
    CONSTRAINT "employee_invitations_lifecycle_check" CHECK (((("status" = 'pending'::"text") AND ("accepted_at" IS NULL) AND ("accepted_by_profile_id" IS NULL) AND ("revoked_at" IS NULL) AND ("revoked_by_profile_id" IS NULL)) OR (("status" = 'accepted'::"text") AND ("accepted_at" IS NOT NULL) AND ("revoked_at" IS NULL) AND ("revoked_by_profile_id" IS NULL)) OR (("status" = 'expired'::"text") AND ("accepted_at" IS NULL) AND ("accepted_by_profile_id" IS NULL) AND ("revoked_at" IS NULL) AND ("revoked_by_profile_id" IS NULL)) OR (("status" = 'revoked'::"text") AND ("accepted_at" IS NULL) AND ("accepted_by_profile_id" IS NULL) AND ("revoked_at" IS NOT NULL)))),
    CONSTRAINT "employee_invitations_role_check" CHECK (("invited_role" = ANY (ARRAY['manager'::"text", 'employee'::"text"]))),
    CONSTRAINT "employee_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'expired'::"text", 'revoked'::"text"]))),
    CONSTRAINT "employee_invitations_token_hash_format" CHECK (("token_hash" ~ '^[0-9a-f]{64}$'::"text"))
);


ALTER TABLE "public"."employee_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_job_functions" (
    "restaurant_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "job_function_id" "uuid" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."employee_job_functions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_legal_profiles" (
    "restaurant_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "birth_date" "date",
    "national_registry_number" "text",
    "sex" "text",
    "nationality" "text",
    "language" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "employee_legal_profiles_sex_check" CHECK ((("sex" IS NULL) OR ("sex" = ANY (ARRAY['female'::"text", 'male'::"text", 'x'::"text", 'unknown'::"text"]))))
);


ALTER TABLE "public"."employee_legal_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_payroll_profiles" (
    "restaurant_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "external_employee_id" "text",
    "payroll_employee_id" "text",
    "iban" "text",
    "bic" "text",
    "hourly_wage_rate" numeric DEFAULT 0 NOT NULL,
    "estimated_hourly_cost" numeric DEFAULT 0 NOT NULL,
    "company_cost_formula" "text",
    "payroll_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "employee_payroll_profiles_estimated_hourly_cost_check" CHECK (("estimated_hourly_cost" >= (0)::numeric)),
    CONSTRAINT "employee_payroll_profiles_hourly_wage_rate_check" CHECK (("hourly_wage_rate" >= (0)::numeric))
);


ALTER TABLE "public"."employee_payroll_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_pin_credentials" (
    "restaurant_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "pin_hash" "text" NOT NULL,
    "pin_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "failed_attempts" integer DEFAULT 0 NOT NULL,
    "locked_until" timestamp with time zone,
    "last_used_at" timestamp with time zone,
    "last_rotated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "employee_pin_credentials_failed_attempts_check" CHECK (("failed_attempts" >= 0)),
    CONSTRAINT "employee_pin_credentials_status_check" CHECK (("pin_status" = ANY (ARRAY['active'::"text", 'reset_required'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."employee_pin_credentials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."employees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_functions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "estimated_hourly_cost" numeric DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "job_functions_code_check" CHECK (("code" <> ''::"text")),
    CONSTRAINT "job_functions_estimated_hourly_cost_check" CHECK (("estimated_hourly_cost" >= (0)::numeric))
);


ALTER TABLE "public"."job_functions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "notification_type" "text" NOT NULL,
    "in_app_enabled" boolean NOT NULL,
    "push_enabled" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


COMMENT ON TABLE "public"."notification_preferences" IS 'Per-user notification settings. Missing row means use notification_types defaults.';



CREATE TABLE IF NOT EXISTS "public"."notification_receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "notification_key" "text" NOT NULL,
    "notification_type" "text" NOT NULL,
    "read_at" timestamp with time zone,
    "dismissed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notification_receipts_key_format" CHECK (((("length"("btrim"("notification_key")) >= 3) AND ("length"("btrim"("notification_key")) <= 240)) AND ("notification_key" !~ '\s'::"text")))
);


ALTER TABLE "public"."notification_receipts" OWNER TO "postgres";


COMMENT ON TABLE "public"."notification_receipts" IS 'Per-user read/dismiss receipts for deterministic derived notification keys.';



COMMENT ON COLUMN "public"."notification_receipts"."notification_key" IS 'Stable derived key, for example absence-request:{absence_id} or forgot-badge-out:{time_entry_id}.';



CREATE TABLE IF NOT EXISTS "public"."notification_types" (
    "code" "text" NOT NULL,
    "audience" "text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "default_action" "text" DEFAULT 'route'::"text" NOT NULL,
    "default_target_module" "text" NOT NULL,
    "default_in_app_enabled" boolean DEFAULT true NOT NULL,
    "default_push_enabled" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 100 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notification_types_audience_check" CHECK (("audience" = ANY (ARRAY['manager'::"text", 'employee'::"text", 'both'::"text"]))),
    CONSTRAINT "notification_types_code_format" CHECK (("code" ~ '^[a-z0-9_]+$'::"text")),
    CONSTRAINT "notification_types_default_action_check" CHECK (("default_action" = ANY (ARRAY['popup'::"text", 'route'::"text"])))
);


ALTER TABLE "public"."notification_types" OWNER TO "postgres";


COMMENT ON TABLE "public"."notification_types" IS 'Catalog of supported notification types. Notification items are derived from operational source tables.';



COMMENT ON COLUMN "public"."notification_types"."default_push_enabled" IS 'Reserved for future web/mobile push. First implementation uses in-app only.';



CREATE TABLE IF NOT EXISTS "public"."opening_hours" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "weekday" smallint NOT NULL,
    "service_key" "text" NOT NULL,
    "is_open" boolean DEFAULT false NOT NULL,
    "opens_at" time without time zone,
    "closes_at" time without time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "opening_hours_weekday_check" CHECK ((("weekday" >= 1) AND ("weekday" <= 7)))
);


ALTER TABLE "public"."opening_hours" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."owner_onboarding_drafts" (
    "auth_user_id" "uuid" NOT NULL,
    "step" smallint DEFAULT 0 NOT NULL,
    "draft" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "owner_onboarding_drafts_object_check" CHECK (("jsonb_typeof"("draft") = 'object'::"text")),
    CONSTRAINT "owner_onboarding_drafts_step_check" CHECK ((("step" >= 0) AND ("step" <= 7)))
);


ALTER TABLE "public"."owner_onboarding_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_export_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "format" "text" DEFAULT 'generic_csv'::"text" NOT NULL,
    "schema_version" smallint DEFAULT 1 NOT NULL,
    "filename" "text" NOT NULL,
    "row_count" integer NOT NULL,
    "total_net_minutes" integer NOT NULL,
    "source_revisions" "jsonb" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "payload_sha256" "text" NOT NULL,
    "created_by_profile_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payroll_export_runs_format_check" CHECK (("format" = 'generic_csv'::"text")),
    CONSTRAINT "payroll_export_runs_minutes_check" CHECK (("total_net_minutes" >= 0)),
    CONSTRAINT "payroll_export_runs_payload_object_check" CHECK (("jsonb_typeof"("payload") = 'object'::"text")),
    CONSTRAINT "payroll_export_runs_period_check" CHECK ((("period_start" <= "period_end") AND (EXTRACT(isodow FROM "period_start") = (1)::numeric) AND (EXTRACT(isodow FROM "period_end") = (7)::numeric) AND (("period_end" - "period_start") <= 370))),
    CONSTRAINT "payroll_export_runs_revisions_array_check" CHECK (("jsonb_typeof"("source_revisions") = 'array'::"text")),
    CONSTRAINT "payroll_export_runs_row_count_check" CHECK (("row_count" > 0)),
    CONSTRAINT "payroll_export_runs_schema_version_check" CHECK (("schema_version" = ANY (ARRAY[1, 2]))),
    CONSTRAINT "payroll_export_runs_sha256_check" CHECK (("payload_sha256" ~ '^[0-9a-f]{64}$'::"text"))
);


ALTER TABLE "public"."payroll_export_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."planned_shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "week_start" "date" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "weekday" smallint NOT NULL,
    "service_key" "text" NOT NULL,
    "job_function_id" "uuid",
    "starts_at" time without time zone,
    "ends_at" time without time zone,
    "source" "public"."planned_shift_source" DEFAULT 'manual'::"public"."planned_shift_source" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "area_id" "uuid",
    CONSTRAINT "planned_shifts_weekday_check" CHECK ((("weekday" >= 1) AND ("weekday" <= 7)))
);


ALTER TABLE "public"."planned_shifts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "auth_user_id" "uuid",
    "first_name" "text",
    "last_name" "text",
    "email" "public"."citext" NOT NULL,
    "phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recurring_schedule_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "weekday" smallint NOT NULL,
    "service_key" "text" NOT NULL,
    "starts_at" time without time zone,
    "ends_at" time without time zone,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "recurring_schedule_slots_time_check" CHECK ((("starts_at" IS NULL) OR ("ends_at" IS NULL) OR ("starts_at" <> "ends_at"))),
    CONSTRAINT "recurring_schedule_slots_weekday_check" CHECK ((("weekday" >= 1) AND ("weekday" <= 7)))
);


ALTER TABLE "public"."recurring_schedule_slots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "status" "text" DEFAULT 'disabled'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "restaurant_memberships_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'manager'::"text", 'employee'::"text"]))),
    CONSTRAINT "restaurant_memberships_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."restaurant_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_onboarding_state" (
    "restaurant_id" "uuid" NOT NULL,
    "state" "text" DEFAULT 'started'::"text" NOT NULL,
    "last_step" "text" DEFAULT 'account'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "workspace_created_at" timestamp with time zone,
    "entered_workspace_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "restaurant_onboarding_last_step_check" CHECK (("last_step" = ANY (ARRAY['account'::"text", 'restaurant'::"text", 'workspace_created'::"text", 'entered_workspace'::"text"]))),
    CONSTRAINT "restaurant_onboarding_state_check" CHECK (("state" = ANY (ARRAY['started'::"text", 'workspace_created'::"text", 'entered_workspace'::"text"])))
);


ALTER TABLE "public"."restaurant_onboarding_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_settings" (
    "restaurant_id" "uuid" NOT NULL,
    "active_week_start" "date",
    "timezone" "text" DEFAULT 'Europe/Brussels'::"text" NOT NULL,
    "locale" "text" DEFAULT 'fr-BE'::"text" NOT NULL,
    "currency_code" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "week_start_weekday" smallint DEFAULT 1 NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "payroll_settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payroll_export_columns" "jsonb",
    CONSTRAINT "restaurant_settings_active_week_start_check" CHECK ((("active_week_start" IS NULL) OR (EXTRACT(isodow FROM "active_week_start") = (1)::numeric))),
    CONSTRAINT "restaurant_settings_payroll_columns_check" CHECK ((("payroll_export_columns" IS NULL) OR (("jsonb_typeof"("payroll_export_columns") = 'array'::"text") AND ("jsonb_array_length"("payroll_export_columns") > 0)))),
    CONSTRAINT "restaurant_settings_week_start_monday_only" CHECK (("week_start_weekday" = 1))
);


ALTER TABLE "public"."restaurant_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "legal_name" "text",
    "company_number" "text",
    "email" "public"."citext",
    "phone" "text",
    "address_line1" "text",
    "postal_code" "text",
    "city" "text",
    "country_code" "text" DEFAULT 'BE'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "owner_profile_id" "uuid" NOT NULL
);


ALTER TABLE "public"."restaurants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "service_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "services_service_key_check" CHECK (("service_key" = ANY (ARRAY['lunch'::"text", 'evening'::"text"])))
);


ALTER TABLE "public"."services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."time_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "planned_shift_id" "uuid",
    "business_date" "date" NOT NULL,
    "service_key" "text" NOT NULL,
    "clock_in_at" timestamp with time zone,
    "clock_in_photo_url" "text",
    "clock_in_photo_status" "text",
    "clock_in_photo_captured_at" timestamp with time zone,
    "clock_out_at" timestamp with time zone,
    "clock_out_photo_url" "text",
    "clock_out_photo_status" "text",
    "clock_out_photo_captured_at" timestamp with time zone,
    "source" "public"."time_entry_source" DEFAULT 'badge_terminal'::"public"."time_entry_source" NOT NULL,
    "status" "public"."time_entry_status" DEFAULT 'open'::"public"."time_entry_status" NOT NULL,
    "adjusted_by_profile_id" "uuid",
    "adjusted_at" timestamp with time zone,
    "adjustment_reason" "text",
    "cancelled_at" timestamp with time zone,
    "cancelled_by_profile_id" "uuid",
    "cancellation_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "break_minutes" integer DEFAULT 0 NOT NULL,
    "revision" bigint DEFAULT 1 NOT NULL,
    CONSTRAINT "time_entries_break_minutes_nonnegative" CHECK (("break_minutes" >= 0)),
    CONSTRAINT "time_entries_clock_in_photo_status_check" CHECK ((("clock_in_photo_status" IS NULL) OR ("clock_in_photo_status" = ANY (ARRAY['captured'::"text", 'denied'::"text", 'unavailable'::"text", 'failed'::"text", 'waived'::"text", 'not_required'::"text", 'missing'::"text"])))),
    CONSTRAINT "time_entries_clock_out_photo_status_check" CHECK ((("clock_out_photo_status" IS NULL) OR ("clock_out_photo_status" = ANY (ARRAY['captured'::"text", 'denied'::"text", 'unavailable'::"text", 'failed'::"text", 'waived'::"text", 'not_required'::"text", 'missing'::"text"])))),
    CONSTRAINT "time_entries_revision_positive" CHECK (("revision" >= 1)),
    CONSTRAINT "time_entries_status_clock_check" CHECK (((("status" = 'open'::"public"."time_entry_status") AND ("clock_in_at" IS NOT NULL) AND ("clock_out_at" IS NULL)) OR (("status" = ANY (ARRAY['closed'::"public"."time_entry_status", 'adjusted'::"public"."time_entry_status"])) AND ("clock_in_at" IS NOT NULL) AND ("clock_out_at" IS NOT NULL) AND ("clock_out_at" >= "clock_in_at")) OR ("status" = 'cancelled'::"public"."time_entry_status")))
);


ALTER TABLE "public"."time_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."time_entry_adjustments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "time_entry_id" "uuid",
    "employee_id" "uuid",
    "business_date" "date" NOT NULL,
    "service_key" "text" NOT NULL,
    "action" "text" NOT NULL,
    "actor_profile_id" "uuid",
    "actor_employee_id" "uuid",
    "actor_role" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "previous_values" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "new_values" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "time_entry_adjustments_action_check" CHECK (("action" = ANY (ARRAY['manual_entry'::"text", 'adjust_entry'::"text", 'cancel_entry'::"text"]))),
    CONSTRAINT "time_entry_adjustments_role_check" CHECK (("actor_role" = ANY (ARRAY['owner'::"text", 'manager'::"text"])))
);


ALTER TABLE "public"."time_entry_adjustments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "week_start" "date" NOT NULL,
    "weekday" smallint NOT NULL,
    "service_key" "text" NOT NULL,
    "note" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "weekly_notes_weekday_check" CHECK ((("weekday" >= 1) AND ("weekday" <= 7)))
);


ALTER TABLE "public"."weekly_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_areas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "notes" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "work_areas_code_not_blank" CHECK (("btrim"("code") <> ''::"text")),
    CONSTRAINT "work_areas_name_not_blank" CHECK (("btrim"("name") <> ''::"text"))
);


ALTER TABLE "public"."work_areas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_pattern_exception_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "work_pattern_exception_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "actor_profile_id" "uuid",
    "actor_employee_id" "uuid",
    "actor_role" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "previous_values" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "new_values" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "work_pattern_exception_events_actor_role_check" CHECK (("actor_role" = ANY (ARRAY['owner'::"text", 'manager'::"text", 'employee'::"text"]))),
    CONSTRAINT "work_pattern_exception_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['requested'::"text", 'created_approved'::"text", 'approved'::"text", 'rejected'::"text", 'cancelled'::"text", 'cancelled_for_planning'::"text", 'manager_comment_updated'::"text"])))
);


ALTER TABLE "public"."work_pattern_exception_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_pattern_exceptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "service_key" "text",
    "status" "public"."operational_request_status" DEFAULT 'pending'::"public"."operational_request_status" NOT NULL,
    "reason" "text" NOT NULL,
    "employee_comment" "text",
    "manager_comment" "text",
    "requested_by_profile_id" "uuid",
    "decided_by_profile_id" "uuid",
    "decided_at" timestamp with time zone,
    "cancelled_by_profile_id" "uuid",
    "cancelled_at" timestamp with time zone,
    "cancellation_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "work_pattern_exceptions_dates_check" CHECK (("end_date" >= "start_date")),
    CONSTRAINT "work_pattern_exceptions_reason_check" CHECK ((("length"("btrim"("reason")) >= 2) AND ("length"("btrim"("reason")) <= 500))),
    CONSTRAINT "work_pattern_exceptions_service_check" CHECK ((("service_key" IS NULL) OR ("service_key" = ANY (ARRAY['lunch'::"text", 'evening'::"text"]))))
);


ALTER TABLE "public"."work_pattern_exceptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_week_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "week_start" "date" NOT NULL,
    "event_type" "text" NOT NULL,
    "actor_profile_id" "uuid",
    "actor_employee_id" "uuid",
    "actor_role" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "previous_values" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "new_values" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "work_week_events_actor_role_check" CHECK (("actor_role" = ANY (ARRAY['owner'::"text", 'manager'::"text", 'system'::"text"]))),
    CONSTRAINT "work_week_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['planning_published'::"text", 'planning_reverted'::"text", 'planning_finalized'::"text", 'actuals_approved'::"text", 'actuals_reopened'::"text", 'actuals_locked'::"text"])))
);


ALTER TABLE "public"."work_week_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_weeks" (
    "restaurant_id" "uuid" NOT NULL,
    "week_start" "date" NOT NULL,
    "planning_status" "public"."planning_status" DEFAULT 'draft'::"public"."planning_status" NOT NULL,
    "published_at" timestamp with time zone,
    "published_by_profile_id" "uuid",
    "actuals_status" "public"."actuals_status" DEFAULT 'open'::"public"."actuals_status" NOT NULL,
    "actuals_approved_at" timestamp with time zone,
    "actuals_approved_by_profile_id" "uuid",
    "actuals_locked_at" timestamp with time zone,
    "actuals_locked_by_profile_id" "uuid",
    "actuals_reopened_at" timestamp with time zone,
    "actuals_reopened_by_profile_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "planning_revision" bigint DEFAULT 0 NOT NULL,
    "actuals_revision" bigint DEFAULT 0 NOT NULL,
    CONSTRAINT "work_weeks_actuals_revision_nonnegative" CHECK (("actuals_revision" >= 0)),
    CONSTRAINT "work_weeks_planning_revision_nonnegative" CHECK (("planning_revision" >= 0)),
    CONSTRAINT "work_weeks_week_start_monday_check" CHECK ((EXTRACT(isodow FROM "week_start") = (1)::numeric))
);


ALTER TABLE "public"."work_weeks" OWNER TO "postgres";


ALTER TABLE ONLY "public"."absence_events"
    ADD CONSTRAINT "absence_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."absence_types"
    ADD CONSTRAINT "absence_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."absence_types"
    ADD CONSTRAINT "absence_types_restaurant_code_key" UNIQUE ("restaurant_id", "code");



ALTER TABLE ONLY "public"."absence_types"
    ADD CONSTRAINT "absence_types_restaurant_id_id_key" UNIQUE ("restaurant_id", "id");



ALTER TABLE ONLY "public"."absences"
    ADD CONSTRAINT "absences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."absences"
    ADD CONSTRAINT "absences_restaurant_id_id_key" UNIQUE ("restaurant_id", "id");



ALTER TABLE ONLY "public"."area_service_defaults"
    ADD CONSTRAINT "area_service_defaults_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."area_service_defaults"
    ADD CONSTRAINT "area_service_defaults_restaurant_area_service_key" UNIQUE ("restaurant_id", "area_id", "service_key");



ALTER TABLE ONLY "public"."badge_verification_challenges"
    ADD CONSTRAINT "badge_verification_challenges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."badge_verification_challenges"
    ADD CONSTRAINT "badge_verification_challenges_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."contract_types"
    ADD CONSTRAINT "contract_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_types"
    ADD CONSTRAINT "contract_types_restaurant_code_key" UNIQUE ("restaurant_id", "code");



ALTER TABLE ONLY "public"."contract_types"
    ADD CONSTRAINT "contract_types_restaurant_id_id_key" UNIQUE ("restaurant_id", "id");



ALTER TABLE ONLY "public"."coverage_requirements"
    ADD CONSTRAINT "coverage_requirements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_access"
    ADD CONSTRAINT "employee_access_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_access"
    ADD CONSTRAINT "employee_access_restaurant_employee_key" UNIQUE ("restaurant_id", "employee_id");



ALTER TABLE ONLY "public"."employee_availability_slots"
    ADD CONSTRAINT "employee_availability_slots_pkey" PRIMARY KEY ("restaurant_id", "week_start", "employee_id", "weekday", "service_key");



ALTER TABLE ONLY "public"."employee_availability_submissions"
    ADD CONSTRAINT "employee_availability_submissions_pkey" PRIMARY KEY ("restaurant_id", "week_start", "employee_id");



ALTER TABLE ONLY "public"."employee_contact_details"
    ADD CONSTRAINT "employee_contact_details_pkey" PRIMARY KEY ("restaurant_id", "employee_id");



ALTER TABLE ONLY "public"."employee_contracts"
    ADD CONSTRAINT "employee_contracts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_contracts"
    ADD CONSTRAINT "employee_contracts_restaurant_id_id_key" UNIQUE ("restaurant_id", "id");



ALTER TABLE ONLY "public"."employee_invitations"
    ADD CONSTRAINT "employee_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_invitations"
    ADD CONSTRAINT "employee_invitations_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."employee_job_functions"
    ADD CONSTRAINT "employee_job_functions_pkey" PRIMARY KEY ("restaurant_id", "employee_id", "job_function_id");



ALTER TABLE ONLY "public"."employee_legal_profiles"
    ADD CONSTRAINT "employee_legal_profiles_pkey" PRIMARY KEY ("restaurant_id", "employee_id");



ALTER TABLE ONLY "public"."employee_payroll_profiles"
    ADD CONSTRAINT "employee_payroll_profiles_pkey" PRIMARY KEY ("restaurant_id", "employee_id");



ALTER TABLE ONLY "public"."employee_pin_credentials"
    ADD CONSTRAINT "employee_pin_credentials_pkey" PRIMARY KEY ("restaurant_id", "employee_id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_restaurant_id_id_key" UNIQUE ("restaurant_id", "id");



ALTER TABLE ONLY "public"."job_functions"
    ADD CONSTRAINT "job_functions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_functions"
    ADD CONSTRAINT "job_functions_restaurant_code_key" UNIQUE ("restaurant_id", "code");



ALTER TABLE ONLY "public"."job_functions"
    ADD CONSTRAINT "job_functions_restaurant_id_id_key" UNIQUE ("restaurant_id", "id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_unique" UNIQUE ("restaurant_id", "profile_id", "notification_type");



ALTER TABLE ONLY "public"."notification_receipts"
    ADD CONSTRAINT "notification_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_receipts"
    ADD CONSTRAINT "notification_receipts_unique" UNIQUE ("restaurant_id", "profile_id", "notification_key");



ALTER TABLE ONLY "public"."notification_types"
    ADD CONSTRAINT "notification_types_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."opening_hours"
    ADD CONSTRAINT "opening_hours_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."opening_hours"
    ADD CONSTRAINT "opening_hours_restaurant_weekday_service_key" UNIQUE ("restaurant_id", "weekday", "service_key");



ALTER TABLE ONLY "public"."owner_onboarding_drafts"
    ADD CONSTRAINT "owner_onboarding_drafts_pkey" PRIMARY KEY ("auth_user_id");



ALTER TABLE ONLY "public"."payroll_export_runs"
    ADD CONSTRAINT "payroll_export_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."planned_shifts"
    ADD CONSTRAINT "planned_shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."planned_shifts"
    ADD CONSTRAINT "planned_shifts_restaurant_id_id_key" UNIQUE ("restaurant_id", "id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_auth_user_id_key" UNIQUE ("auth_user_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurring_schedule_slots"
    ADD CONSTRAINT "recurring_schedule_slots_employee_day_service_key" UNIQUE ("restaurant_id", "employee_id", "weekday", "service_key");



ALTER TABLE ONLY "public"."recurring_schedule_slots"
    ADD CONSTRAINT "recurring_schedule_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_memberships"
    ADD CONSTRAINT "restaurant_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_memberships"
    ADD CONSTRAINT "restaurant_memberships_restaurant_profile_key" UNIQUE ("restaurant_id", "profile_id");



ALTER TABLE ONLY "public"."restaurant_onboarding_state"
    ADD CONSTRAINT "restaurant_onboarding_state_pkey" PRIMARY KEY ("restaurant_id");



ALTER TABLE ONLY "public"."restaurant_settings"
    ADD CONSTRAINT "restaurant_settings_pkey" PRIMARY KEY ("restaurant_id");



ALTER TABLE ONLY "public"."restaurants"
    ADD CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurants"
    ADD CONSTRAINT "restaurants_workspace_slug_key" UNIQUE ("workspace_slug");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_restaurant_id_id_key" UNIQUE ("restaurant_id", "id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_restaurant_service_key_key" UNIQUE ("restaurant_id", "service_key");



ALTER TABLE ONLY "public"."time_entries"
    ADD CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."time_entries"
    ADD CONSTRAINT "time_entries_restaurant_id_id_key" UNIQUE ("restaurant_id", "id");



ALTER TABLE ONLY "public"."time_entry_adjustments"
    ADD CONSTRAINT "time_entry_adjustments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_notes"
    ADD CONSTRAINT "weekly_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_areas"
    ADD CONSTRAINT "work_areas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_areas"
    ADD CONSTRAINT "work_areas_restaurant_code_key" UNIQUE ("restaurant_id", "code");



ALTER TABLE ONLY "public"."work_areas"
    ADD CONSTRAINT "work_areas_restaurant_id_id_key" UNIQUE ("restaurant_id", "id");



ALTER TABLE ONLY "public"."work_pattern_exception_events"
    ADD CONSTRAINT "work_pattern_exception_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_pattern_exceptions"
    ADD CONSTRAINT "work_pattern_exceptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_pattern_exceptions"
    ADD CONSTRAINT "work_pattern_exceptions_restaurant_id_id_key" UNIQUE ("restaurant_id", "id");



ALTER TABLE ONLY "public"."work_week_events"
    ADD CONSTRAINT "work_week_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_weeks"
    ADD CONSTRAINT "work_weeks_pkey" PRIMARY KEY ("restaurant_id", "week_start");



CREATE INDEX "absence_events_actor_idx" ON "public"."absence_events" USING "btree" ("restaurant_id", "actor_profile_id", "created_at");



CREATE INDEX "absence_events_restaurant_absence_idx" ON "public"."absence_events" USING "btree" ("restaurant_id", "absence_id", "created_at");



CREATE UNIQUE INDEX "absence_types_restaurant_code_upper_idx" ON "public"."absence_types" USING "btree" ("restaurant_id", "upper"("code"));



CREATE INDEX "absences_active_overlap_lookup_idx" ON "public"."absences" USING "btree" ("restaurant_id", "employee_id", "status", "start_date", "end_date", "service_key") WHERE ("status" = ANY (ARRAY['pending'::"public"."operational_request_status", 'approved'::"public"."operational_request_status"]));



CREATE INDEX "absences_restaurant_employee_dates_idx" ON "public"."absences" USING "btree" ("restaurant_id", "employee_id", "start_date", "end_date");



CREATE INDEX "badge_verification_challenges_expiry_idx" ON "public"."badge_verification_challenges" USING "btree" ("expires_at");



CREATE INDEX "badge_verification_challenges_lookup_idx" ON "public"."badge_verification_challenges" USING "btree" ("restaurant_id", "employee_id", "actor_profile_id", "token_hash") WHERE ("used_at" IS NULL);



CREATE INDEX "contract_types_restaurant_active_idx" ON "public"."contract_types" USING "btree" ("restaurant_id", "active", "sort_order");



CREATE INDEX "coverage_requirements_restaurant_idx" ON "public"."coverage_requirements" USING "btree" ("restaurant_id", "active", "sort_order");



CREATE UNIQUE INDEX "employee_access_one_profile_per_restaurant_idx" ON "public"."employee_access" USING "btree" ("restaurant_id", "profile_id") WHERE ("profile_id" IS NOT NULL);



CREATE INDEX "employee_access_profile_idx" ON "public"."employee_access" USING "btree" ("profile_id");



CREATE INDEX "employee_availability_slots_restaurant_week_idx" ON "public"."employee_availability_slots" USING "btree" ("restaurant_id", "week_start", "employee_id", "weekday", "service_key");



CREATE INDEX "employee_availability_submissions_restaurant_week_idx" ON "public"."employee_availability_submissions" USING "btree" ("restaurant_id", "week_start", "employee_id");



CREATE INDEX "employee_contracts_employee_history_idx" ON "public"."employee_contracts" USING "btree" ("restaurant_id", "employee_id", "contract_start" DESC NULLS LAST, "created_at" DESC);



CREATE UNIQUE INDEX "employee_contracts_one_current_active_per_employee" ON "public"."employee_contracts" USING "btree" ("restaurant_id", "employee_id") WHERE (("active" = true) AND ("is_current" = true));



CREATE INDEX "employee_invitations_email_history_idx" ON "public"."employee_invitations" USING "btree" ("lower"(("email")::"text"), "sent_at" DESC);



CREATE INDEX "employee_invitations_employee_history_idx" ON "public"."employee_invitations" USING "btree" ("restaurant_id", "employee_id", "sent_at" DESC);



CREATE UNIQUE INDEX "employee_invitations_one_pending_email_idx" ON "public"."employee_invitations" USING "btree" ("restaurant_id", "email") WHERE ("status" = 'pending'::"text");



CREATE UNIQUE INDEX "employee_invitations_one_pending_employee_idx" ON "public"."employee_invitations" USING "btree" ("restaurant_id", "employee_id") WHERE ("status" = 'pending'::"text");



CREATE UNIQUE INDEX "employee_job_functions_one_primary_idx" ON "public"."employee_job_functions" USING "btree" ("restaurant_id", "employee_id") WHERE ("is_primary" AND "active");



CREATE INDEX "employees_restaurant_active_idx" ON "public"."employees" USING "btree" ("restaurant_id", "active", "sort_order");



CREATE INDEX "job_functions_restaurant_active_idx" ON "public"."job_functions" USING "btree" ("restaurant_id", "active", "sort_order");



CREATE INDEX "notification_preferences_profile_restaurant_idx" ON "public"."notification_preferences" USING "btree" ("profile_id", "restaurant_id");



CREATE INDEX "notification_preferences_restaurant_type_idx" ON "public"."notification_preferences" USING "btree" ("restaurant_id", "notification_type");



CREATE INDEX "notification_receipts_profile_restaurant_idx" ON "public"."notification_receipts" USING "btree" ("profile_id", "restaurant_id");



CREATE INDEX "notification_receipts_restaurant_type_idx" ON "public"."notification_receipts" USING "btree" ("restaurant_id", "notification_type");



CREATE INDEX "notification_receipts_unread_idx" ON "public"."notification_receipts" USING "btree" ("restaurant_id", "profile_id", "read_at", "dismissed_at");



CREATE INDEX "notification_types_active_sort_idx" ON "public"."notification_types" USING "btree" ("active", "audience", "sort_order");



CREATE INDEX "opening_hours_restaurant_idx" ON "public"."opening_hours" USING "btree" ("restaurant_id", "weekday", "service_key");



CREATE INDEX "payroll_export_runs_restaurant_period_idx" ON "public"."payroll_export_runs" USING "btree" ("restaurant_id", "period_start" DESC, "period_end" DESC, "created_at" DESC);



CREATE UNIQUE INDEX "planned_shifts_one_per_employee_service_slot" ON "public"."planned_shifts" USING "btree" ("restaurant_id", "week_start", "employee_id", "weekday", "service_key");



CREATE INDEX "profiles_auth_user_idx" ON "public"."profiles" USING "btree" ("auth_user_id");



CREATE INDEX "restaurant_memberships_profile_idx" ON "public"."restaurant_memberships" USING "btree" ("profile_id");



CREATE INDEX "services_restaurant_active_idx" ON "public"."services" USING "btree" ("restaurant_id", "active", "sort_order");



CREATE UNIQUE INDEX "time_entries_one_non_cancelled_per_employee_service_day" ON "public"."time_entries" USING "btree" ("restaurant_id", "employee_id", "business_date", "service_key") WHERE ("status" <> 'cancelled'::"public"."time_entry_status");



CREATE UNIQUE INDEX "time_entries_one_open_per_employee" ON "public"."time_entries" USING "btree" ("restaurant_id", "employee_id") WHERE ("status" = 'open'::"public"."time_entry_status");



CREATE INDEX "time_entries_restaurant_date_idx" ON "public"."time_entries" USING "btree" ("restaurant_id", "business_date", "employee_id");



CREATE INDEX "time_entry_adjustments_restaurant_date_idx" ON "public"."time_entry_adjustments" USING "btree" ("restaurant_id", "business_date", "employee_id");



CREATE INDEX "time_entry_adjustments_time_entry_idx" ON "public"."time_entry_adjustments" USING "btree" ("restaurant_id", "time_entry_id");



CREATE UNIQUE INDEX "weekly_notes_one_per_service_slot" ON "public"."weekly_notes" USING "btree" ("restaurant_id", "week_start", "weekday", "service_key");



CREATE INDEX "work_pattern_exception_events_exception_idx" ON "public"."work_pattern_exception_events" USING "btree" ("restaurant_id", "work_pattern_exception_id", "created_at");



CREATE INDEX "work_pattern_exceptions_employee_status_idx" ON "public"."work_pattern_exceptions" USING "btree" ("restaurant_id", "employee_id", "status");



CREATE INDEX "work_pattern_exceptions_restaurant_dates_idx" ON "public"."work_pattern_exceptions" USING "btree" ("restaurant_id", "start_date", "end_date");



CREATE INDEX "work_week_events_actor_idx" ON "public"."work_week_events" USING "btree" ("restaurant_id", "actor_profile_id", "created_at");



CREATE INDEX "work_week_events_restaurant_week_idx" ON "public"."work_week_events" USING "btree" ("restaurant_id", "week_start", "created_at");



CREATE INDEX "work_weeks_restaurant_week_idx" ON "public"."work_weeks" USING "btree" ("restaurant_id", "week_start");



CREATE OR REPLACE TRIGGER "absence_events_append_only" BEFORE DELETE OR UPDATE ON "public"."absence_events" FOR EACH ROW EXECUTE FUNCTION "public"."reject_audit_evidence_mutation"();



CREATE OR REPLACE TRIGGER "absence_types_set_updated_at" BEFORE UPDATE ON "public"."absence_types" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "absences_set_updated_at" BEFORE UPDATE ON "public"."absences" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "contract_types_set_updated_at" BEFORE UPDATE ON "public"."contract_types" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "coverage_requirements_set_updated_at" BEFORE UPDATE ON "public"."coverage_requirements" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "employee_access_set_updated_at" BEFORE UPDATE ON "public"."employee_access" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "employee_availability_mode_guard" BEFORE INSERT OR UPDATE ON "public"."employee_availability_slots" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_employee_availability_mode"();



CREATE OR REPLACE TRIGGER "employee_availability_slots_set_updated_at" BEFORE UPDATE ON "public"."employee_availability_slots" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "employee_availability_submissions_set_updated_at" BEFORE UPDATE ON "public"."employee_availability_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "employee_contact_details_set_updated_at" BEFORE UPDATE ON "public"."employee_contact_details" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "employee_contracts_history_guard" BEFORE DELETE OR UPDATE ON "public"."employee_contracts" FOR EACH ROW EXECUTE FUNCTION "public"."guard_employee_contract_history"();



CREATE OR REPLACE TRIGGER "employee_contracts_set_updated_at" BEFORE UPDATE ON "public"."employee_contracts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "employee_legal_profiles_set_updated_at" BEFORE UPDATE ON "public"."employee_legal_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "employee_payroll_profiles_set_updated_at" BEFORE UPDATE ON "public"."employee_payroll_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "employee_pin_credentials_set_updated_at" BEFORE UPDATE ON "public"."employee_pin_credentials" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "employees_set_updated_at" BEFORE UPDATE ON "public"."employees" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "job_functions_set_updated_at" BEFORE UPDATE ON "public"."job_functions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "opening_hours_set_updated_at" BEFORE UPDATE ON "public"."opening_hours" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "payroll_export_runs_append_only" BEFORE DELETE OR UPDATE ON "public"."payroll_export_runs" FOR EACH ROW EXECUTE FUNCTION "public"."reject_payroll_export_evidence_mutation"();



CREATE OR REPLACE TRIGGER "planned_shifts_set_updated_at" BEFORE UPDATE ON "public"."planned_shifts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_set_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE CONSTRAINT TRIGGER "recurring_schedule_slots_regime_guard" AFTER INSERT OR UPDATE ON "public"."recurring_schedule_slots" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "public"."enforce_fixed_schedule_domain"();



CREATE OR REPLACE TRIGGER "restaurant_memberships_set_updated_at" BEFORE UPDATE ON "public"."restaurant_memberships" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "restaurant_onboarding_state_set_updated_at" BEFORE UPDATE ON "public"."restaurant_onboarding_state" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "restaurant_settings_set_updated_at" BEFORE UPDATE ON "public"."restaurant_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE CONSTRAINT TRIGGER "restaurants_fixed_services_guard" AFTER INSERT ON "public"."restaurants" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "public"."enforce_fixed_restaurant_services"();



CREATE OR REPLACE TRIGGER "restaurants_set_updated_at" BEFORE UPDATE ON "public"."restaurants" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE CONSTRAINT TRIGGER "services_fixed_contract_guard" AFTER INSERT OR DELETE OR UPDATE ON "public"."services" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "public"."enforce_fixed_restaurant_services"();



CREATE OR REPLACE TRIGGER "services_set_updated_at" BEFORE UPDATE ON "public"."services" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_notification_preferences_updated_at" BEFORE UPDATE ON "public"."notification_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."set_notification_updated_at"();



CREATE OR REPLACE TRIGGER "set_notification_receipts_updated_at" BEFORE UPDATE ON "public"."notification_receipts" FOR EACH ROW EXECUTE FUNCTION "public"."set_notification_updated_at"();



CREATE OR REPLACE TRIGGER "set_notification_types_updated_at" BEFORE UPDATE ON "public"."notification_types" FOR EACH ROW EXECUTE FUNCTION "public"."set_notification_updated_at"();



CREATE OR REPLACE TRIGGER "time_entries_actuals_revision" AFTER INSERT OR DELETE OR UPDATE ON "public"."time_entries" FOR EACH ROW EXECUTE FUNCTION "public"."bump_actuals_revision_for_entry"();



CREATE OR REPLACE TRIGGER "time_entries_history_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."time_entries" FOR EACH ROW EXECUTE FUNCTION "public"."guard_time_entry_history"();



CREATE OR REPLACE TRIGGER "time_entries_revision_guard" BEFORE UPDATE ON "public"."time_entries" FOR EACH ROW EXECUTE FUNCTION "public"."advance_time_entry_revision"();



CREATE OR REPLACE TRIGGER "time_entries_set_updated_at" BEFORE UPDATE ON "public"."time_entries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "time_entry_adjustments_append_only" BEFORE DELETE OR UPDATE ON "public"."time_entry_adjustments" FOR EACH ROW EXECUTE FUNCTION "public"."reject_audit_evidence_mutation"();



CREATE OR REPLACE TRIGGER "trg_capture_owner_of_record" AFTER INSERT ON "public"."restaurant_memberships" FOR EACH ROW EXECUTE FUNCTION "public"."capture_owner_of_record"();



CREATE OR REPLACE TRIGGER "trg_enforce_owner_membership" BEFORE DELETE OR UPDATE ON "public"."restaurant_memberships" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_owner_membership"();



CREATE OR REPLACE TRIGGER "weekly_notes_set_updated_at" BEFORE UPDATE ON "public"."weekly_notes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "work_pattern_exception_events_append_only" BEFORE DELETE OR UPDATE ON "public"."work_pattern_exception_events" FOR EACH ROW EXECUTE FUNCTION "public"."reject_audit_evidence_mutation"();



CREATE CONSTRAINT TRIGGER "work_pattern_exceptions_regime_guard" AFTER INSERT OR UPDATE ON "public"."work_pattern_exceptions" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "public"."enforce_fixed_schedule_domain"();



CREATE OR REPLACE TRIGGER "work_week_events_append_only" BEFORE DELETE OR UPDATE ON "public"."work_week_events" FOR EACH ROW EXECUTE FUNCTION "public"."reject_audit_evidence_mutation"();



CREATE OR REPLACE TRIGGER "work_weeks_actuals_approval_guard" BEFORE UPDATE OF "actuals_status" ON "public"."work_weeks" FOR EACH ROW EXECUTE FUNCTION "public"."guard_actuals_approval"();



CREATE OR REPLACE TRIGGER "work_weeks_set_updated_at" BEFORE UPDATE ON "public"."work_weeks" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."absence_events"
    ADD CONSTRAINT "absence_events_absence_fk" FOREIGN KEY ("restaurant_id", "absence_id") REFERENCES "public"."absences"("restaurant_id", "id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."absence_events"
    ADD CONSTRAINT "absence_events_actor_employee_fk" FOREIGN KEY ("restaurant_id", "actor_employee_id") REFERENCES "public"."employees"("restaurant_id", "id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."absence_events"
    ADD CONSTRAINT "absence_events_actor_profile_id_fkey" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."absence_events"
    ADD CONSTRAINT "absence_events_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."absence_types"
    ADD CONSTRAINT "absence_types_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."absences"
    ADD CONSTRAINT "absences_approved_by_profile_id_fkey" FOREIGN KEY ("approved_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."absences"
    ADD CONSTRAINT "absences_cancelled_by_profile_id_fkey" FOREIGN KEY ("cancelled_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."absences"
    ADD CONSTRAINT "absences_employee_fk" FOREIGN KEY ("restaurant_id", "employee_id") REFERENCES "public"."employees"("restaurant_id", "id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."absences"
    ADD CONSTRAINT "absences_rejected_by_profile_id_fkey" FOREIGN KEY ("rejected_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."absences"
    ADD CONSTRAINT "absences_requested_by_profile_id_fkey" FOREIGN KEY ("requested_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."absences"
    ADD CONSTRAINT "absences_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."absences"
    ADD CONSTRAINT "absences_service_fk" FOREIGN KEY ("restaurant_id", "service_key") REFERENCES "public"."services"("restaurant_id", "service_key");



ALTER TABLE ONLY "public"."absences"
    ADD CONSTRAINT "absences_type_fk" FOREIGN KEY ("restaurant_id", "absence_type_id") REFERENCES "public"."absence_types"("restaurant_id", "id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."area_service_defaults"
    ADD CONSTRAINT "area_service_defaults_area_fk" FOREIGN KEY ("restaurant_id", "area_id") REFERENCES "public"."work_areas"("restaurant_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."area_service_defaults"
    ADD CONSTRAINT "area_service_defaults_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."area_service_defaults"
    ADD CONSTRAINT "area_service_defaults_service_fk" FOREIGN KEY ("restaurant_id", "service_key") REFERENCES "public"."services"("restaurant_id", "service_key");



ALTER TABLE ONLY "public"."badge_verification_challenges"
    ADD CONSTRAINT "badge_verification_challenges_actor_profile_id_fkey" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."badge_verification_challenges"
    ADD CONSTRAINT "badge_verification_challenges_employee_fkey" FOREIGN KEY ("restaurant_id", "employee_id") REFERENCES "public"."employees"("restaurant_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_types"
    ADD CONSTRAINT "contract_types_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coverage_requirements"
    ADD CONSTRAINT "coverage_requirements_area_fk" FOREIGN KEY ("restaurant_id", "area_id") REFERENCES "public"."work_areas"("restaurant_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coverage_requirements"
    ADD CONSTRAINT "coverage_requirements_job_function_fk" FOREIGN KEY ("restaurant_id", "job_function_id") REFERENCES "public"."job_functions"("restaurant_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coverage_requirements"
    ADD CONSTRAINT "coverage_requirements_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coverage_requirements"
    ADD CONSTRAINT "coverage_requirements_service_fk" FOREIGN KEY ("restaurant_id", "service_key") REFERENCES "public"."services"("restaurant_id", "service_key");



ALTER TABLE ONLY "public"."employee_access"
    ADD CONSTRAINT "employee_access_employee_fk" FOREIGN KEY ("restaurant_id", "employee_id") REFERENCES "public"."employees"("restaurant_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_access"
    ADD CONSTRAINT "employee_access_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employee_access"
    ADD CONSTRAINT "employee_access_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_availability_slots"
    ADD CONSTRAINT "employee_availability_slots_employee_fk" FOREIGN KEY ("restaurant_id", "employee_id") REFERENCES "public"."employees"("restaurant_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_availability_slots"
    ADD CONSTRAINT "employee_availability_slots_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_availability_slots"
    ADD CONSTRAINT "employee_availability_slots_service_fk" FOREIGN KEY ("restaurant_id", "service_key") REFERENCES "public"."services"("restaurant_id", "service_key");



ALTER TABLE ONLY "public"."employee_availability_slots"
    ADD CONSTRAINT "employee_availability_slots_week_fk" FOREIGN KEY ("restaurant_id", "week_start") REFERENCES "public"."work_weeks"("restaurant_id", "week_start") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_availability_submissions"
    ADD CONSTRAINT "employee_availability_submissions_employee_fk" FOREIGN KEY ("restaurant_id", "employee_id") REFERENCES "public"."employees"("restaurant_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_availability_submissions"
    ADD CONSTRAINT "employee_availability_submissions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_availability_submissions"
    ADD CONSTRAINT "employee_availability_submissions_week_fk" FOREIGN KEY ("restaurant_id", "week_start") REFERENCES "public"."work_weeks"("restaurant_id", "week_start") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_contact_details"
    ADD CONSTRAINT "employee_contact_details_employee_fk" FOREIGN KEY ("restaurant_id", "employee_id") REFERENCES "public"."employees"("restaurant_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_contracts"
    ADD CONSTRAINT "employee_contracts_contract_type_fk" FOREIGN KEY ("restaurant_id", "contract_type_id") REFERENCES "public"."contract_types"("restaurant_id", "id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."employee_contracts"
    ADD CONSTRAINT "employee_contracts_employee_fk" FOREIGN KEY ("restaurant_id", "employee_id") REFERENCES "public"."employees"("restaurant_id", "id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."employee_contracts"
    ADD CONSTRAINT "employee_contracts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_invitations"
    ADD CONSTRAINT "employee_invitations_accepted_by_profile_id_fkey" FOREIGN KEY ("accepted_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employee_invitations"
    ADD CONSTRAINT "employee_invitations_employee_fk" FOREIGN KEY ("restaurant_id", "employee_id") REFERENCES "public"."employees"("restaurant_id", "id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."employee_invitations"
    ADD CONSTRAINT "employee_invitations_invited_by_profile_id_fkey" FOREIGN KEY ("invited_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employee_invitations"
    ADD CONSTRAINT "employee_invitations_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_invitations"
    ADD CONSTRAINT "employee_invitations_revoked_by_profile_id_fkey" FOREIGN KEY ("revoked_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employee_job_functions"
    ADD CONSTRAINT "employee_job_functions_employee_fk" FOREIGN KEY ("restaurant_id", "employee_id") REFERENCES "public"."employees"("restaurant_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_job_functions"
    ADD CONSTRAINT "employee_job_functions_job_function_fk" FOREIGN KEY ("restaurant_id", "job_function_id") REFERENCES "public"."job_functions"("restaurant_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_job_functions"
    ADD CONSTRAINT "employee_job_functions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_legal_profiles"
    ADD CONSTRAINT "employee_legal_profiles_employee_fk" FOREIGN KEY ("restaurant_id", "employee_id") REFERENCES "public"."employees"("restaurant_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_payroll_profiles"
    ADD CONSTRAINT "employee_payroll_profiles_employee_fk" FOREIGN KEY ("restaurant_id", "employee_id") REFERENCES "public"."employees"("restaurant_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_pin_credentials"
    ADD CONSTRAINT "employee_pin_credentials_employee_fk" FOREIGN KEY ("restaurant_id", "employee_id") REFERENCES "public"."employees"("restaurant_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_functions"
    ADD CONSTRAINT "job_functions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_membership_fk" FOREIGN KEY ("restaurant_id", "profile_id") REFERENCES "public"."restaurant_memberships"("restaurant_id", "profile_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_notification_type_fkey" FOREIGN KEY ("notification_type") REFERENCES "public"."notification_types"("code") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."notification_receipts"
    ADD CONSTRAINT "notification_receipts_membership_fk" FOREIGN KEY ("restaurant_id", "profile_id") REFERENCES "public"."restaurant_memberships"("restaurant_id", "profile_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_receipts"
    ADD CONSTRAINT "notification_receipts_notification_type_fkey" FOREIGN KEY ("notification_type") REFERENCES "public"."notification_types"("code") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."opening_hours"
    ADD CONSTRAINT "opening_hours_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."opening_hours"
    ADD CONSTRAINT "opening_hours_service_fk" FOREIGN KEY ("restaurant_id", "service_key") REFERENCES "public"."services"("restaurant_id", "service_key");



ALTER TABLE ONLY "public"."owner_onboarding_drafts"
    ADD CONSTRAINT "owner_onboarding_drafts_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payroll_export_runs"
    ADD CONSTRAINT "payroll_export_runs_actor_fk" FOREIGN KEY ("created_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payroll_export_runs"
    ADD CONSTRAINT "payroll_export_runs_restaurant_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."planned_shifts"
    ADD CONSTRAINT "planned_shifts_area_fk" FOREIGN KEY ("restaurant_id", "area_id") REFERENCES "public"."work_areas"("restaurant_id", "id");



ALTER TABLE ONLY "public"."planned_shifts"
    ADD CONSTRAINT "planned_shifts_employee_fk" FOREIGN KEY ("restaurant_id", "employee_id") REFERENCES "public"."employees"("restaurant_id", "id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."planned_shifts"
    ADD CONSTRAINT "planned_shifts_job_function_fk" FOREIGN KEY ("restaurant_id", "job_function_id") REFERENCES "public"."job_functions"("restaurant_id", "id");



ALTER TABLE ONLY "public"."planned_shifts"
    ADD CONSTRAINT "planned_shifts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."planned_shifts"
    ADD CONSTRAINT "planned_shifts_service_fk" FOREIGN KEY ("restaurant_id", "service_key") REFERENCES "public"."services"("restaurant_id", "service_key");



ALTER TABLE ONLY "public"."planned_shifts"
    ADD CONSTRAINT "planned_shifts_week_fk" FOREIGN KEY ("restaurant_id", "week_start") REFERENCES "public"."work_weeks"("restaurant_id", "week_start") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recurring_schedule_slots"
    ADD CONSTRAINT "recurring_schedule_slots_employee_fk" FOREIGN KEY ("restaurant_id", "employee_id") REFERENCES "public"."employees"("restaurant_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_schedule_slots"
    ADD CONSTRAINT "recurring_schedule_slots_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_schedule_slots"
    ADD CONSTRAINT "recurring_schedule_slots_service_fk" FOREIGN KEY ("restaurant_id", "service_key") REFERENCES "public"."services"("restaurant_id", "service_key");



ALTER TABLE ONLY "public"."restaurant_memberships"
    ADD CONSTRAINT "restaurant_memberships_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurant_memberships"
    ADD CONSTRAINT "restaurant_memberships_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurant_onboarding_state"
    ADD CONSTRAINT "restaurant_onboarding_state_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurant_settings"
    ADD CONSTRAINT "restaurant_settings_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurants"
    ADD CONSTRAINT "restaurants_owner_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."time_entries"
    ADD CONSTRAINT "time_entries_adjusted_by_profile_id_fkey" FOREIGN KEY ("adjusted_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."time_entries"
    ADD CONSTRAINT "time_entries_cancelled_by_profile_id_fkey" FOREIGN KEY ("cancelled_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."time_entries"
    ADD CONSTRAINT "time_entries_employee_fk" FOREIGN KEY ("restaurant_id", "employee_id") REFERENCES "public"."employees"("restaurant_id", "id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."time_entries"
    ADD CONSTRAINT "time_entries_planned_shift_fk" FOREIGN KEY ("restaurant_id", "planned_shift_id") REFERENCES "public"."planned_shifts"("restaurant_id", "id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."time_entries"
    ADD CONSTRAINT "time_entries_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."time_entries"
    ADD CONSTRAINT "time_entries_service_fk" FOREIGN KEY ("restaurant_id", "service_key") REFERENCES "public"."services"("restaurant_id", "service_key");



ALTER TABLE ONLY "public"."time_entry_adjustments"
    ADD CONSTRAINT "time_entry_adjustments_actor_employee_fk" FOREIGN KEY ("restaurant_id", "actor_employee_id") REFERENCES "public"."employees"("restaurant_id", "id") ON DELETE SET NULL ("actor_employee_id");



ALTER TABLE ONLY "public"."time_entry_adjustments"
    ADD CONSTRAINT "time_entry_adjustments_actor_profile_id_fkey" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."time_entry_adjustments"
    ADD CONSTRAINT "time_entry_adjustments_employee_fk" FOREIGN KEY ("restaurant_id", "employee_id") REFERENCES "public"."employees"("restaurant_id", "id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."time_entry_adjustments"
    ADD CONSTRAINT "time_entry_adjustments_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."time_entry_adjustments"
    ADD CONSTRAINT "time_entry_adjustments_service_fk" FOREIGN KEY ("restaurant_id", "service_key") REFERENCES "public"."services"("restaurant_id", "service_key") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."time_entry_adjustments"
    ADD CONSTRAINT "time_entry_adjustments_time_entry_fk" FOREIGN KEY ("restaurant_id", "time_entry_id") REFERENCES "public"."time_entries"("restaurant_id", "id") ON DELETE SET NULL ("time_entry_id");



ALTER TABLE ONLY "public"."weekly_notes"
    ADD CONSTRAINT "weekly_notes_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_notes"
    ADD CONSTRAINT "weekly_notes_service_fk" FOREIGN KEY ("restaurant_id", "service_key") REFERENCES "public"."services"("restaurant_id", "service_key");



ALTER TABLE ONLY "public"."weekly_notes"
    ADD CONSTRAINT "weekly_notes_week_fk" FOREIGN KEY ("restaurant_id", "week_start") REFERENCES "public"."work_weeks"("restaurant_id", "week_start") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."work_areas"
    ADD CONSTRAINT "work_areas_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_pattern_exception_events"
    ADD CONSTRAINT "work_pattern_exception_events_actor_employee_fk" FOREIGN KEY ("restaurant_id", "actor_employee_id") REFERENCES "public"."employees"("restaurant_id", "id");



ALTER TABLE ONLY "public"."work_pattern_exception_events"
    ADD CONSTRAINT "work_pattern_exception_events_actor_profile_id_fkey" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_pattern_exception_events"
    ADD CONSTRAINT "work_pattern_exception_events_employee_fk" FOREIGN KEY ("restaurant_id", "employee_id") REFERENCES "public"."employees"("restaurant_id", "id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."work_pattern_exception_events"
    ADD CONSTRAINT "work_pattern_exception_events_exception_fk" FOREIGN KEY ("restaurant_id", "work_pattern_exception_id") REFERENCES "public"."work_pattern_exceptions"("restaurant_id", "id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."work_pattern_exception_events"
    ADD CONSTRAINT "work_pattern_exception_events_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_pattern_exceptions"
    ADD CONSTRAINT "work_pattern_exceptions_cancelled_by_profile_id_fkey" FOREIGN KEY ("cancelled_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_pattern_exceptions"
    ADD CONSTRAINT "work_pattern_exceptions_decided_by_profile_id_fkey" FOREIGN KEY ("decided_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_pattern_exceptions"
    ADD CONSTRAINT "work_pattern_exceptions_employee_fk" FOREIGN KEY ("restaurant_id", "employee_id") REFERENCES "public"."employees"("restaurant_id", "id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."work_pattern_exceptions"
    ADD CONSTRAINT "work_pattern_exceptions_requested_by_profile_id_fkey" FOREIGN KEY ("requested_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_pattern_exceptions"
    ADD CONSTRAINT "work_pattern_exceptions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_pattern_exceptions"
    ADD CONSTRAINT "work_pattern_exceptions_service_fk" FOREIGN KEY ("restaurant_id", "service_key") REFERENCES "public"."services"("restaurant_id", "service_key");



ALTER TABLE ONLY "public"."work_week_events"
    ADD CONSTRAINT "work_week_events_actor_employee_fk" FOREIGN KEY ("restaurant_id", "actor_employee_id") REFERENCES "public"."employees"("restaurant_id", "id") ON DELETE SET NULL ("actor_employee_id");



ALTER TABLE ONLY "public"."work_week_events"
    ADD CONSTRAINT "work_week_events_actor_profile_id_fkey" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_week_events"
    ADD CONSTRAINT "work_week_events_week_fk" FOREIGN KEY ("restaurant_id", "week_start") REFERENCES "public"."work_weeks"("restaurant_id", "week_start") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."work_weeks"
    ADD CONSTRAINT "work_weeks_actuals_approved_by_profile_id_fkey" FOREIGN KEY ("actuals_approved_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_weeks"
    ADD CONSTRAINT "work_weeks_actuals_locked_by_profile_id_fkey" FOREIGN KEY ("actuals_locked_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_weeks"
    ADD CONSTRAINT "work_weeks_actuals_reopened_by_profile_id_fkey" FOREIGN KEY ("actuals_reopened_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_weeks"
    ADD CONSTRAINT "work_weeks_published_by_profile_id_fkey" FOREIGN KEY ("published_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_weeks"
    ADD CONSTRAINT "work_weeks_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE "public"."absence_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."absence_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."absences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."area_service_defaults" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."badge_verification_challenges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coverage_requirements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_access" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_availability_slots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_availability_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_contact_details" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_contracts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_job_functions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_legal_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_payroll_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_pin_credentials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_functions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_preferences_delete_own" ON "public"."notification_preferences" FOR DELETE TO "authenticated" USING ((("profile_id" = "public"."current_profile_id"()) AND "public"."is_restaurant_member"("restaurant_id")));



CREATE POLICY "notification_preferences_insert_own" ON "public"."notification_preferences" FOR INSERT TO "authenticated" WITH CHECK ((("profile_id" = "public"."current_profile_id"()) AND "public"."is_restaurant_member"("restaurant_id")));



CREATE POLICY "notification_preferences_select_own" ON "public"."notification_preferences" FOR SELECT TO "authenticated" USING ((("profile_id" = "public"."current_profile_id"()) AND "public"."is_restaurant_member"("restaurant_id")));



CREATE POLICY "notification_preferences_update_own" ON "public"."notification_preferences" FOR UPDATE TO "authenticated" USING ((("profile_id" = "public"."current_profile_id"()) AND "public"."is_restaurant_member"("restaurant_id"))) WITH CHECK ((("profile_id" = "public"."current_profile_id"()) AND "public"."is_restaurant_member"("restaurant_id")));



ALTER TABLE "public"."notification_receipts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_receipts_insert_own" ON "public"."notification_receipts" FOR INSERT TO "authenticated" WITH CHECK ((("profile_id" = "public"."current_profile_id"()) AND "public"."is_restaurant_member"("restaurant_id")));



CREATE POLICY "notification_receipts_select_own" ON "public"."notification_receipts" FOR SELECT TO "authenticated" USING ((("profile_id" = "public"."current_profile_id"()) AND "public"."is_restaurant_member"("restaurant_id")));



CREATE POLICY "notification_receipts_update_own" ON "public"."notification_receipts" FOR UPDATE TO "authenticated" USING ((("profile_id" = "public"."current_profile_id"()) AND "public"."is_restaurant_member"("restaurant_id"))) WITH CHECK ((("profile_id" = "public"."current_profile_id"()) AND "public"."is_restaurant_member"("restaurant_id")));



ALTER TABLE "public"."notification_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_types_select_active" ON "public"."notification_types" FOR SELECT TO "authenticated" USING (("active" = true));



ALTER TABLE "public"."opening_hours" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."owner_onboarding_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payroll_export_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."planned_shifts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recurring_schedule_slots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_onboarding_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."time_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."time_entry_adjustments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weekly_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_areas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_pattern_exception_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_pattern_exceptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_week_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_weeks" ENABLE ROW LEVEL SECURITY;


REVOKE ALL ON SCHEMA "public" FROM PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_employee_invite"("p_restaurant_id" "uuid", "p_invitation_token" "text", "p_pin" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_employee_invite"("p_restaurant_id" "uuid", "p_invitation_token" "text", "p_pin" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."active_membership_role"("p_restaurant_id" "uuid", "p_profile_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."actuals_snapshot_for_week"("p_restaurant_id" "uuid", "p_week_start" "date") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."advance_time_entry_revision"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."badge_photo_status_to_db"("p_status" "text", "p_photo_url" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."build_employee_operations_read_model"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_from_date" "date", "p_to_date" "date") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."build_manager_operations_read_model"("p_restaurant_id" "uuid", "p_role" "text", "p_from_date" "date", "p_to_date" "date") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."build_restaurant_read_model"("p_restaurant_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."build_team_read_model"("p_restaurant_id" "uuid", "p_role" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."build_workspace_bootstrap_read_model"("p_restaurant_id" "uuid", "p_employee_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."bump_actuals_revision_for_entry"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."capture_owner_of_record"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."clear_owner_onboarding_draft"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clear_owner_onboarding_draft"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_payroll_export_run"("p_restaurant_id" "uuid", "p_period_start" "date", "p_period_end" "date", "p_columns" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_payroll_export_run"("p_restaurant_id" "uuid", "p_period_start" "date", "p_period_end" "date", "p_columns" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."crypt"("password" "text", "salt" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."current_profile_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_profile_id"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."employee_invitation_states_for_restaurant"("p_restaurant_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."enforce_employee_availability_mode"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."enforce_fixed_restaurant_services"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."enforce_fixed_schedule_domain"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."enforce_owner_membership"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."gen_salt"("type" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."gen_salt"("type" "text", "iter_count" integer) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."generate_four_digit_pin"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."get_current_memberships"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_current_memberships"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_employee_invitation_context"("p_restaurant_id" "uuid", "p_invitation_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_employee_invitation_context"("p_restaurant_id" "uuid", "p_invitation_token" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_employee_operations_read_model"("p_restaurant_id" "uuid", "p_from_date" "date", "p_to_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_employee_operations_read_model"("p_restaurant_id" "uuid", "p_from_date" "date", "p_to_date" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_manager_operations_read_model"("p_restaurant_id" "uuid", "p_from_date" "date", "p_to_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_manager_operations_read_model"("p_restaurant_id" "uuid", "p_from_date" "date", "p_to_date" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_owner_onboarding_draft"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_owner_onboarding_draft"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_payroll_export_run"("p_restaurant_id" "uuid", "p_run_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_payroll_export_run"("p_restaurant_id" "uuid", "p_run_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_restaurant_read_model"("p_restaurant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_restaurant_read_model"("p_restaurant_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_team_read_model"("p_restaurant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_team_read_model"("p_restaurant_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_workspace_bootstrap"("p_restaurant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_workspace_bootstrap"("p_restaurant_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_workspace_context"("p_restaurant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_workspace_context"("p_restaurant_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."guard_actuals_approval"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."guard_employee_contract_history"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."guard_time_entry_history"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."is_own_employee"("target_restaurant_id" "uuid", "target_employee_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."is_owner"("target_restaurant_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."is_owner_or_manager"("target_restaurant_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."is_restaurant_member"("target_restaurant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_restaurant_member"("target_restaurant_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_work_week_draft"("p_restaurant_id" "uuid", "p_week_start" "date") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."list_badge_roster"("p_restaurant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_badge_roster"("p_restaurant_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."payroll_export_field_label"("p_key" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."payroll_export_run_summaries"("p_restaurant_id" "uuid", "p_from_date" "date", "p_to_date" "date") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."planning_publish_issues"("p_restaurant_id" "uuid", "p_week_start" "date", "p_planned_shifts" "jsonb") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."planning_snapshot_for_week"("p_restaurant_id" "uuid", "p_week_start" "date") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."preview_payroll_export"("p_restaurant_id" "uuid", "p_period_start" "date", "p_period_end" "date", "p_columns" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."preview_payroll_export"("p_restaurant_id" "uuid", "p_period_start" "date", "p_period_end" "date", "p_columns" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."record_badge_entry"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_badge_token" "uuid", "p_service_key" "text", "p_photo_url" "text", "p_photo_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_badge_entry"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_badge_token" "uuid", "p_service_key" "text", "p_photo_url" "text", "p_photo_status" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."register_employee_invitation"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_email" "public"."citext", "p_role" "text", "p_token" "text", "p_expires_at" timestamp with time zone, "p_invited_by_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."register_employee_invitation"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_email" "public"."citext", "p_role" "text", "p_token" "text", "p_expires_at" timestamp with time zone, "p_invited_by_profile_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reject_audit_evidence_mutation"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."reject_payroll_export_evidence_mutation"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."require_owner_context"("p_restaurant_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."require_owner_or_manager_context"("p_restaurant_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."require_workspace_read_context"("p_restaurant_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."revoke_employee_invitation"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revoke_employee_invitation"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."revoke_employee_invitation_delivery"("p_invitation_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revoke_employee_invitation_delivery"("p_invitation_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_absence_lifecycle"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_absence_id" "uuid", "p_action" "text", "p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_absence_lifecycle"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_absence_id" "uuid", "p_action" "text", "p_payload" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."save_actuals_lifecycle"("p_restaurant_id" "uuid", "p_action" "text", "p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_actuals_lifecycle"("p_restaurant_id" "uuid", "p_action" "text", "p_payload" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."save_employee_availability"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_availability" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_employee_availability"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_availability" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."save_manager_planning"("p_restaurant_id" "uuid", "p_week_start" "date", "p_planning_status" "text", "p_planned_shifts" "jsonb", "p_weekly_notes" "jsonb", "p_expected_revision" bigint, "p_reason" "text", "p_allow_coverage_gaps" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_manager_planning"("p_restaurant_id" "uuid", "p_week_start" "date", "p_planning_status" "text", "p_planned_shifts" "jsonb", "p_weekly_notes" "jsonb", "p_expected_revision" bigint, "p_reason" "text", "p_allow_coverage_gaps" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."save_owner_onboarding_draft"("p_step" smallint, "p_draft" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_owner_onboarding_draft"("p_step" smallint, "p_draft" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."save_restaurant_model"("p_restaurant_id" "uuid", "p_restaurant" "jsonb", "p_settings" "jsonb", "p_job_functions" "jsonb", "p_areas" "jsonb", "p_opening_hours" "jsonb", "p_area_service_defaults" "jsonb", "p_coverage_requirements" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_restaurant_model"("p_restaurant_id" "uuid", "p_restaurant" "jsonb", "p_settings" "jsonb", "p_job_functions" "jsonb", "p_areas" "jsonb", "p_opening_hours" "jsonb", "p_area_service_defaults" "jsonb", "p_coverage_requirements" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."save_team_model"("p_restaurant_id" "uuid", "p_employees" "jsonb", "p_employee_job_functions" "jsonb", "p_recurring_schedule_slots" "jsonb", "p_contacts" "jsonb", "p_legal_profiles" "jsonb", "p_contracts" "jsonb", "p_payroll_profiles" "jsonb", "p_access" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_team_model"("p_restaurant_id" "uuid", "p_employees" "jsonb", "p_employee_job_functions" "jsonb", "p_recurring_schedule_slots" "jsonb", "p_contacts" "jsonb", "p_legal_profiles" "jsonb", "p_contracts" "jsonb", "p_payroll_profiles" "jsonb", "p_access" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."save_work_pattern_exception_lifecycle"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_work_pattern_exception_id" "uuid", "p_action" "text", "p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_work_pattern_exception_lifecycle"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_work_pattern_exception_id" "uuid", "p_action" "text", "p_payload" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."service_key_from_display"("value" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."set_employee_access_state"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_action" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_employee_access_state"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_action" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_notification_updated_at"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."set_own_pin"("p_new_pin" "text", "p_restaurant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_own_pin"("p_new_pin" "text", "p_restaurant_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_payroll_export_columns"("p_restaurant_id" "uuid", "p_columns" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_payroll_export_columns"("p_restaurant_id" "uuid", "p_columns" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_updated_at"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."setup_owner_workspace"("p_owner_first_name" "text", "p_owner_last_name" "text", "p_owner_email" "public"."citext", "p_restaurant_name" "text", "p_city" "text", "p_employees" "jsonb", "p_opening_hours" "jsonb", "p_areas" "jsonb", "p_job_functions" "jsonb", "p_coverage" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."setup_owner_workspace"("p_owner_first_name" "text", "p_owner_last_name" "text", "p_owner_email" "public"."citext", "p_restaurant_name" "text", "p_city" "text", "p_employees" "jsonb", "p_opening_hours" "jsonb", "p_areas" "jsonb", "p_job_functions" "jsonb", "p_coverage" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."slugify_workspace"("input" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."unique_workspace_slug"("base_name" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."update_own_profile"("p_first_name" "text", "p_last_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_own_profile"("p_first_name" "text", "p_last_name" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."verify_badge_pin"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_pin" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_badge_pin"("p_restaurant_id" "uuid", "p_employee_id" "uuid", "p_pin" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."week_start_for_date"("p_date" "date") FROM PUBLIC;



GRANT ALL ON TABLE "public"."absence_events" TO "service_role";



GRANT ALL ON TABLE "public"."absence_types" TO "service_role";



GRANT ALL ON TABLE "public"."absences" TO "service_role";



GRANT ALL ON TABLE "public"."area_service_defaults" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."badge_verification_challenges" TO "service_role";



GRANT ALL ON TABLE "public"."contract_types" TO "service_role";



GRANT ALL ON TABLE "public"."coverage_requirements" TO "service_role";



GRANT ALL ON TABLE "public"."employee_access" TO "service_role";



GRANT ALL ON TABLE "public"."employee_availability_slots" TO "service_role";



GRANT ALL ON TABLE "public"."employee_availability_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."employee_contact_details" TO "service_role";



GRANT ALL ON TABLE "public"."employee_contracts" TO "service_role";



GRANT ALL ON TABLE "public"."employee_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."employee_job_functions" TO "service_role";



GRANT ALL ON TABLE "public"."employee_legal_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."employee_payroll_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."employee_pin_credentials" TO "service_role";



GRANT ALL ON TABLE "public"."employees" TO "service_role";



GRANT ALL ON TABLE "public"."job_functions" TO "service_role";



GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."notification_preferences" TO "authenticated";



GRANT ALL ON TABLE "public"."notification_receipts" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."notification_receipts" TO "authenticated";



GRANT ALL ON TABLE "public"."notification_types" TO "service_role";
GRANT SELECT ON TABLE "public"."notification_types" TO "authenticated";



GRANT ALL ON TABLE "public"."opening_hours" TO "service_role";



GRANT ALL ON TABLE "public"."owner_onboarding_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_export_runs" TO "service_role";



GRANT ALL ON TABLE "public"."planned_shifts" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."recurring_schedule_slots" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_onboarding_state" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_settings" TO "service_role";



GRANT ALL ON TABLE "public"."restaurants" TO "service_role";



GRANT ALL ON TABLE "public"."services" TO "service_role";



GRANT ALL ON TABLE "public"."time_entries" TO "service_role";



GRANT ALL ON TABLE "public"."time_entry_adjustments" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_notes" TO "service_role";



GRANT ALL ON TABLE "public"."work_areas" TO "service_role";



GRANT ALL ON TABLE "public"."work_pattern_exception_events" TO "service_role";



GRANT ALL ON TABLE "public"."work_pattern_exceptions" TO "service_role";



GRANT ALL ON TABLE "public"."work_week_events" TO "service_role";



GRANT ALL ON TABLE "public"."work_weeks" TO "service_role";
