begin;

-- Function body and privilege fixes must be visible to PostgREST before the
-- browser can call setup_owner_workspace through /rest/v1/rpc.
notify pgrst, 'reload schema';

commit;
