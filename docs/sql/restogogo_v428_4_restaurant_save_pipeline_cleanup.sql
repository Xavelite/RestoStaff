-- restogogo v428.4 — Restaurant save pipeline cleanup
-- Safe post-v428.3 sanity script.
-- No structural DB refactor: the coverage model remains Zone × Service × Position = Required count.

-- Keep prototype access aligned for the coverage table while full auth/RLS is postponed.
alter table public.restogogo_zone_coverage_requirements enable row level security;

drop policy if exists "prototype_select_zone_coverage_requirements" on public.restogogo_zone_coverage_requirements;
drop policy if exists "prototype_insert_zone_coverage_requirements" on public.restogogo_zone_coverage_requirements;
drop policy if exists "prototype_update_zone_coverage_requirements" on public.restogogo_zone_coverage_requirements;
drop policy if exists "prototype_delete_zone_coverage_requirements" on public.restogogo_zone_coverage_requirements;

create policy "prototype_select_zone_coverage_requirements"
on public.restogogo_zone_coverage_requirements
for select
to anon, authenticated
using (true);

create policy "prototype_insert_zone_coverage_requirements"
on public.restogogo_zone_coverage_requirements
for insert
to anon, authenticated
with check (true);

create policy "prototype_update_zone_coverage_requirements"
on public.restogogo_zone_coverage_requirements
for update
to anon, authenticated
using (true)
with check (true);

create policy "prototype_delete_zone_coverage_requirements"
on public.restogogo_zone_coverage_requirements
for delete
to anon, authenticated
using (true);

-- Refresh metadata/version for this cleanup baseline.
update public.restogogo_restaurants
   set settings = coalesce(settings, '{}'::jsonb) || '{"schemaVersion":38}'::jsonb,
       updated_at = now();

notify pgrst, 'reload schema';
