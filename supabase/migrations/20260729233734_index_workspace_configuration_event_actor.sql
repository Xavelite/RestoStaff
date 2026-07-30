create index workspace_configuration_events_actor_profile_idx
  on public.workspace_configuration_events (actor_profile_id)
  where actor_profile_id is not null;
