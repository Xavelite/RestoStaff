-- Internal area and position codes are technical identifiers. Keep them
-- unique without exposing a database constraint error when two names once
-- produced the same draft code.
create or replace function public.ensure_workspace_item_code_unique()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_base text;
  v_exists boolean;
  v_attempt integer := 0;
  v_id_suffix text;
begin
  new.code := public.slugify_workspace(coalesce(nullif(btrim(new.code), ''), new.name));
  v_base := new.code;
  v_id_suffix := left(replace(new.id::text, '-', ''), 8);

  loop
    if tg_table_name = 'job_functions' then
      select exists (
        select 1
        from public.job_functions item
        where item.restaurant_id = new.restaurant_id
          and item.code = new.code
          and item.id <> new.id
      ) into v_exists;
    elsif tg_table_name = 'work_areas' then
      select exists (
        select 1
        from public.work_areas item
        where item.restaurant_id = new.restaurant_id
          and item.code = new.code
          and item.id <> new.id
      ) into v_exists;
    else
      raise exception 'Unsupported workspace item table: %', tg_table_name;
    end if;

    exit when not v_exists;
    v_attempt := v_attempt + 1;
    new.code := v_base || '-' || v_id_suffix ||
      case when v_attempt = 1 then '' else '-' || v_attempt::text end;
  end loop;

  return new;
end;
$$;

drop trigger if exists job_functions_unique_code_guard on public.job_functions;
create trigger job_functions_unique_code_guard
before insert or update of restaurant_id, code, name
on public.job_functions
for each row execute function public.ensure_workspace_item_code_unique();

drop trigger if exists work_areas_unique_code_guard on public.work_areas;
create trigger work_areas_unique_code_guard
before insert or update of restaurant_id, code, name
on public.work_areas
for each row execute function public.ensure_workspace_item_code_unique();

revoke all on function public.ensure_workspace_item_code_unique() from public;
