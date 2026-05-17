-- restogogo v428.5 — coverage save truth reset
-- No data model refactor. This keeps the existing coverage table and refreshes
-- prototype policies/grants used by the current unauthenticated prototype.

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

grant select, insert, update, delete on public.restogogo_zone_coverage_requirements to anon, authenticated;

update public.restogogo_restaurants
set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('schemaVersion', 39),
    updated_at = now()
where id = 'bouillon-bruxelles';

notify pgrst, 'reload schema';
