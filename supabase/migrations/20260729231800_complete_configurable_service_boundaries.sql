begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';
select pg_advisory_xact_lock(
  hashtextextended('restogogo:20260729231800:configurable-service-boundaries', 0)
);

drop trigger if exists restaurants_fixed_services_guard on public.restaurants;
drop trigger if exists services_fixed_contract_guard on public.services;
drop function if exists public.enforce_fixed_restaurant_services();

alter table public.services
  drop constraint if exists services_service_key_check;

alter table public.work_pattern_exceptions
  drop constraint if exists work_pattern_exceptions_service_check;

create or replace function public.service_key_from_display(value text)
returns text
language sql
immutable
set search_path = public
as $service_key$
  select case
    when lower(btrim(coalesce(value, ''))) ~ '^[a-z][a-z0-9-]{0,39}$'
      then lower(btrim(value))
    else null
  end
$service_key$;

-- These mature mutation functions are patched in place so their established
-- authorization, locking and audit contracts remain unchanged. Every anchor
-- is asserted before execution; a future source change therefore fails the
-- migration instead of partially weakening a boundary.
do $patch_service_functions$
declare
  v_source text;
  v_updated text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(
    'public.save_employee_availability(uuid,uuid,jsonb)'::regprocedure
  ) into v_source;
  v_old := $old$
    if v_service_key not in ('lunch', 'evening') then
      raise exception 'Invalid service.';
    end if;$old$;
  v_new := $new$
    if not exists (
      select 1
      from public.services service
      where service.restaurant_id = p_restaurant_id
        and service.service_key = v_service_key
        and service.active
    ) then
      raise exception 'Invalid or inactive service.';
    end if;$new$;
  v_updated := replace(v_source, v_old, v_new);
  if v_updated = v_source then
    raise exception 'save_employee_availability service validation anchor changed.';
  end if;
  execute v_updated;

  select pg_get_functiondef(
    'public.save_work_pattern_exception_lifecycle(uuid,uuid,uuid,text,jsonb)'::regprocedure
  ) into v_source;
  v_old := $old$
    if v_service_key is not null and v_service_key not in ('lunch', 'evening') then
      raise exception 'Invalid service.';
    end if;$old$;
  v_new := $new$
    if v_service_key is not null and not exists (
      select 1
      from public.services service
      where service.restaurant_id = p_restaurant_id
        and service.service_key = v_service_key
        and service.active
    ) then
      raise exception 'Invalid or inactive service.';
    end if;$new$;
  v_updated := replace(v_source, v_old, v_new);
  if v_updated = v_source then
    raise exception 'save_work_pattern_exception_lifecycle service validation anchor changed.';
  end if;
  execute v_updated;

  select pg_get_functiondef(
    'public._badge_record_core(uuid,uuid,uuid,uuid,uuid,text,text,text)'::regprocedure
  ) into v_source;

  v_old :=
    $old$coalesce(ps.starts_at, case ps.service_key when 'evening' then time '18:00' else time '11:00' end)$old$;
  v_new :=
    $new$coalesce(
              ps.starts_at,
              (
                select min(opening.opens_at)
                from public.opening_hours opening
                where opening.restaurant_id = ps.restaurant_id
                  and opening.service_key = ps.service_key
                  and opening.weekday = ps.weekday
                  and opening.is_open
              ),
              (
                select min(defaults.start_time)
                from public.area_service_defaults defaults
                where defaults.restaurant_id = ps.restaurant_id
                  and defaults.service_key = ps.service_key
              ),
              time '12:00'
            )$new$;
  v_updated := replace(v_source, v_old, v_new);
  if v_updated = v_source then
    raise exception '_badge_record_core planned-service fallback anchor changed.';
  end if;
  v_source := v_updated;

  v_old :=
    $old$coalesce(defaults.start_time, case s.service_key when 'evening' then time '18:00' else time '11:00' end)$old$;
  v_new :=
    $new$coalesce(
              defaults.start_time,
              (
                select min(opening.opens_at)
                from public.opening_hours opening
                where opening.restaurant_id = s.restaurant_id
                  and opening.service_key = s.service_key
                  and opening.weekday = extract(isodow from v_business_date)::smallint
                  and opening.is_open
              ),
              time '12:00'
            )$new$;
  v_updated := replace(v_source, v_old, v_new);
  if v_updated = v_source then
    raise exception '_badge_record_core configured-service fallback anchor changed.';
  end if;
  v_source := v_updated;

  v_old := $old$
    if coalesce(v_service_key, '') not in ('lunch', 'evening') then
      v_service_key := case when v_local_time < time '16:00' then 'lunch' else 'evening' end;
    end if;$old$;
  v_new := $new$
    if not exists (
      select 1
      from public.services service
      where service.restaurant_id = p_restaurant_id
        and service.service_key = v_service_key
        and service.active
    ) then
      select service.service_key
      into v_service_key
      from public.services service
      left join lateral (
        select min(defaults.start_time) as start_time
        from public.area_service_defaults defaults
        where defaults.restaurant_id = service.restaurant_id
          and defaults.service_key = service.service_key
      ) configured on true
      left join lateral (
        select min(opening.opens_at) as starts_at
        from public.opening_hours opening
        where opening.restaurant_id = service.restaurant_id
          and opening.service_key = service.service_key
          and opening.weekday = extract(isodow from v_business_date)::smallint
          and opening.is_open
      ) hours on true
      where service.restaurant_id = p_restaurant_id
        and service.active
      order by
        least(
          abs(extract(epoch from (
            coalesce(configured.start_time, hours.starts_at, time '12:00')
            - v_local_time
          ))),
          86400 - abs(extract(epoch from (
            coalesce(configured.start_time, hours.starts_at, time '12:00')
            - v_local_time
          )))
        ),
        service.sort_order,
        service.service_key
      limit 1;
    end if;

    if v_service_key is null then
      raise exception 'No active service is configured for this restaurant.';
    end if;$new$;
  v_updated := replace(v_source, v_old, v_new);
  if v_updated = v_source then
    raise exception '_badge_record_core fixed-service validation anchor changed.';
  end if;
  execute v_updated;
end
$patch_service_functions$;

comment on function public.service_key_from_display(text) is
  'Normalizes a configured service key. Lunch and Evening remain starter values, not a closed enum.';

notify pgrst, 'reload schema';
commit;
