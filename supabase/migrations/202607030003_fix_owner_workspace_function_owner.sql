begin;

-- The owner-onboarding RPC is a browser-callable SECURITY DEFINER routine, but
-- it must be owned by the database table owner so its internal restaurant reads
-- do not require direct table grants to authenticated users.
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
