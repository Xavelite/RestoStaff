begin;

create or replace function public.create_open_shift_request(
  p_restaurant_id uuid,
  p_business_date date,
  p_service_key text,
  p_note text default '',
  p_needed_count integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $create_open_shift$
declare
  v_actor record;
  v_today date;
  v_request_id uuid;
  v_timezone text;
  v_response_deadline timestamptz;
begin
  select * into v_actor from public.require_restaurant_manager(p_restaurant_id);
  select coalesce(timezone, 'Europe/Brussels') into v_timezone
  from public.restaurant_settings where restaurant_id = p_restaurant_id;
  v_timezone := coalesce(v_timezone, 'Europe/Brussels');
  v_today := (now() at time zone v_timezone)::date;

  if p_business_date is null or p_business_date < v_today or p_business_date > v_today + 14 then
    raise exception 'Open-shift date must be within the next 14 days.' using errcode = '22023';
  end if;
  if p_service_key not in ('lunch', 'evening') then
    raise exception 'Choose lunch or evening.' using errcode = '22023';
  end if;
  if coalesce(p_needed_count, 0) not between 1 and 20 then
    raise exception 'Needed employee count must be between 1 and 20.' using errcode = '22023';
  end if;
  if length(coalesce(p_note, '')) > 500 then
    raise exception 'Note is too long.' using errcode = '22023';
  end if;

  v_response_deadline := case
    when p_business_date = v_today then now() + interval '3 hours'
    else (
      (
        p_business_date::text
        || case when p_service_key = 'lunch' then ' 10:00:00' else ' 16:00:00' end
      )::timestamp at time zone v_timezone
    )
  end;

  insert into public.open_shift_requests (
    restaurant_id, business_date, service_key, note, needed_count,
    response_deadline, created_by_profile_id
  ) values (
    p_restaurant_id, p_business_date, p_service_key, btrim(coalesce(p_note, '')),
    p_needed_count, v_response_deadline, v_actor.profile_id
  ) returning id into v_request_id;

  return jsonb_build_object('ok', true, 'request_id', v_request_id);
end
$create_open_shift$;

revoke all on function public.create_open_shift_request(uuid,date,text,text,integer)
  from public, anon, authenticated;
grant execute on function public.create_open_shift_request(uuid,date,text,text,integer)
  to authenticated;

commit;
