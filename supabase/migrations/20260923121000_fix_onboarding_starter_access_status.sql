begin;

-- Starter employees do not have an authenticated account yet. The current
-- access lifecycle stores that state as disabled; invitation state lives in
-- employee_invitations. A later workspace-catalogue migration replaced this
-- routine from an older definition and accidentally restored not_invited.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.setup_owner_workspace(text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  )
  into v_definition;

  if v_definition is null then
    raise exception 'setup_owner_workspace RPC is missing.';
  end if;

  if strpos(v_definition, '''not_invited''') > 0 then
    v_definition := replace(v_definition, '''not_invited''', '''disabled''');
    execute v_definition;
  elsif strpos(v_definition, '''disabled''') = 0 then
    raise exception 'setup_owner_workspace uses an unknown employee access status.';
  end if;
end;
$$;

revoke all on function public.setup_owner_workspace(
  text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public.setup_owner_workspace(
  text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb
) to authenticated;

notify pgrst, 'reload schema';

commit;
