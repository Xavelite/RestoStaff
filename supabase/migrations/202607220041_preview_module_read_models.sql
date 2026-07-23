-- Complete read-only preview coverage for the Team and Restaurant pages.
begin;

create function public.get_preview_module(
  p_restaurant_id uuid,
  p_role text,
  p_employee_id uuid,
  p_module text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $preview_module$
begin
  perform public.require_preview_access(p_restaurant_id, p_role, p_employee_id);
  if p_role = 'employee' then
    raise exception 'Employee previews do not expose manager modules.' using errcode = '42501';
  end if;
  if p_module = 'team' then
    return public.build_team_read_model(p_restaurant_id, p_role);
  elsif p_module = 'restaurant' and p_role = 'owner' then
    return public.build_restaurant_read_model(p_restaurant_id);
  end if;
  raise exception 'Unsupported preview module.' using errcode = '22023';
end
$preview_module$;

revoke all on function public.get_preview_module(uuid,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.get_preview_module(uuid,text,uuid,text)
  to authenticated;

commit;
