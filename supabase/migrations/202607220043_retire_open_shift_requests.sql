begin;

-- Messages are the single team-contact workflow. Keep the communications read
-- model focused before removing the retired open-shift relations it once read.
create or replace function public.build_communications_read_model(
  p_restaurant_id uuid,
  p_role text,
  p_employee_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $communications_model$
  select jsonb_build_object(
    'employees', case when p_role in ('owner', 'manager') then coalesce((
      select jsonb_agg(to_jsonb(e) order by e.sort_order, e.display_name)
      from public.employees e
      where e.restaurant_id = p_restaurant_id and e.active
    ), '[]'::jsonb) else '[]'::jsonb end,
    'messages', coalesce((
      select jsonb_agg(
        to_jsonb(m) || jsonb_build_object(
          'sender_name', nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
        ) order by m.created_at desc
      )
      from public.operational_messages m
      left join public.profiles p on p.id = m.sender_profile_id
      where m.restaurant_id = p_restaurant_id
        and m.created_at >= now() - interval '90 days'
        and (p_role in ('owner', 'manager') or exists (
          select 1 from public.operational_message_recipients mr
          where mr.message_id = m.id and mr.employee_id = p_employee_id
        ))
    ), '[]'::jsonb),
    'message_recipients', coalesce((
      select jsonb_agg(to_jsonb(mr))
      from public.operational_message_recipients mr
      join public.operational_messages m on m.id = mr.message_id
      where mr.restaurant_id = p_restaurant_id
        and m.created_at >= now() - interval '90 days'
        and (p_role in ('owner', 'manager') or mr.employee_id = p_employee_id)
    ), '[]'::jsonb)
  )
$communications_model$;

drop function if exists public.cancel_open_shift_request(uuid, uuid);
drop function if exists public.confirm_open_shift_request(uuid, uuid, uuid[]);
drop function if exists public.respond_to_open_shift_request(uuid, uuid, text);
drop function if exists public.create_open_shift_request(uuid, date, text, text, integer);

drop table if exists public.open_shift_responses;
drop table if exists public.open_shift_requests;

delete from public.push_notification_deliveries
where notification_type in (
  'open_shift_request_created',
  'open_shift_response_received',
  'open_shift_selection_decided'
);
delete from public.notification_receipts
where notification_type in (
  'open_shift_request_created',
  'open_shift_response_received',
  'open_shift_selection_decided'
);
delete from public.notification_preferences
where notification_type in (
  'open_shift_request_created',
  'open_shift_response_received',
  'open_shift_selection_decided'
);
delete from public.notification_types
where code in (
  'open_shift_request_created',
  'open_shift_response_received',
  'open_shift_selection_decided'
);

commit;
