-- Trigger functions still require runtime execution permission from the role
-- performing the owning table write.
grant execute on function public.ensure_workspace_item_code_unique() to authenticated, service_role;
