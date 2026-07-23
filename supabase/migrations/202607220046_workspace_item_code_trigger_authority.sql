-- The trigger calls the internal slug helper, whose execution stays private.
-- Run the trigger with its migration-owner authority instead of widening that
-- helper's public API.
alter function public.ensure_workspace_item_code_unique() security definer;
