# restogogo v428.6 - Coverage editor binding cleanup

v428.6 keeps the verified coverage save path and fixes the Restaurant coverage editor so visible count changes become the runtime source of truth before save.

## What changed

- Coverage controls carry explicit `zoneId`, `serviceKey`, and `positionId`.
- Coverage count controls share one `- / number / +` renderer for Lunch and Evening.
- Restaurant mutations keep a single `restaurantSetup` reference per operation before assigning nested setup state.
- Coverage values update `restaurantSetup.coverageRequirements` immediately on input, change, or stepper click.
- Restaurant save upserts and verifies the full `Zone x Service x Position` coverage matrix.
- Investigation-only draft/debug paths were removed; save and Supabase failures still print real console errors.

## SQL

No structural DB migration is required after v428.5.

Optional sanity script:

```txt
docs/sql/restogogo_v428_6_coverage_editor_binding_cleanup.sql
```

## Test

1. Deploy v428.6 files.
2. Hard refresh.
3. Go to Restaurant -> Operations -> Zones.
4. Change `AC / Lunch / Maitre d'hotel`.
5. Save.
6. Refresh.
7. Confirm the value remains saved and the DB row is updated.
