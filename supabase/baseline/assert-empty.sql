do $$
begin
  if to_regclass('public.restaurants') is not null
     or to_regclass('public.profiles') is not null
     or to_regclass('public.work_weeks') is not null then
    raise exception 'Bootstrap target is not an empty Restogogo project.';
  end if;
end
$$;
