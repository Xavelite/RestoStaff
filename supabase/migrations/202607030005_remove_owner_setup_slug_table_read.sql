begin;

-- Do not call unique_workspace_slug from the browser-facing setup RPC. That
-- helper must read public.restaurants before the owner membership exists, which
-- can trip table privilege boundaries. A short UUID suffix gives the onboarding
-- slug uniqueness without any pre-insert restaurant read.
do $$
declare
  v_definition text;
  v_before text;
begin
  select pg_get_functiondef(
    'public.setup_owner_workspace(text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  )
  into v_definition;
  v_before := v_definition;

  v_definition := replace(
    v_definition,
    'public.unique_workspace_slug(p_restaurant_name),',
    'left(coalesce(nullif(public.slugify_workspace(p_restaurant_name), ''''), ''restaurant''), 40) || ''-'' || left(replace(gen_random_uuid()::text, ''-'', ''''), 12),'
  );

  if v_definition = v_before then
    raise exception 'Owner setup slug contract drifted.';
  end if;

  execute v_definition;
end;
$$;

alter function public.setup_owner_workspace(
  text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb
) owner to postgres;
revoke all on function public.setup_owner_workspace(
  text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public.setup_owner_workspace(
  text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb
) to authenticated;

commit;
