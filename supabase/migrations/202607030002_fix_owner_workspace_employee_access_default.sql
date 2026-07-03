begin;

-- Starter employees created during owner onboarding do not have authenticated
-- access yet. After the email-first access lifecycle, that inactive state is
-- represented by employee_access.access_status = 'disabled'; invitations carry
-- pending/revoked/expired state separately.
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

  v_definition := replace(v_definition, '''not_invited''', '''disabled''');
  execute v_definition;
end;
$$;

revoke all on function public.setup_owner_workspace(
  text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public.setup_owner_workspace(
  text,text,citext,text,text,jsonb,jsonb,jsonb,jsonb,jsonb
) to authenticated;

commit;
