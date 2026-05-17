-- restogogo v428.6 — coverage editor binding cleanup
-- No structural migration required. This only bumps the workspace schema marker.

update public.restogogo_restaurants
   set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('schemaVersion', 40),
       updated_at = now()
 where id = 'bouillon-bruxelles';
