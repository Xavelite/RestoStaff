begin;

-- setup_owner_workspace calls unique_workspace_slug before inserting the
-- restaurant. The helper reads public.restaurants and must run under the table
-- owner; authenticated users should still reach it only through the setup RPC.
alter function public.unique_workspace_slug(text) owner to postgres;
alter function public.unique_workspace_slug(text) security definer;
alter function public.unique_workspace_slug(text) set search_path = public;

revoke all on function public.unique_workspace_slug(text)
  from public, anon, authenticated;

commit;
