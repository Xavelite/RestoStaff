-- Branding updates require an authenticated owner or manager context. The
-- service role does not need this client-facing RPC and remains outside the
-- reviewed server allowlist.
begin;

revoke execute on function public.set_restaurant_logo(uuid, text)
  from service_role;

commit;
