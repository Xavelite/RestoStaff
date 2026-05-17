# restogogo v428.6 cleanup report

## Focus

The coverage save pipeline already upserts and verifies the Supabase matrix. The remaining problem was local state handoff: repeated `setup()` calls could normalize and replace `data.restaurantSetup`, so assignments such as `setup().coverageRequirements = ...` could land on a discarded setup object.

## Cleanup performed

- Removed the temporary coverage draft/debug layer used during investigation.
- Consolidated Lunch and Evening coverage controls into one renderer.
- Standardized Restaurant setup mutations to capture `restaurantSetup` once per operation before writing nested state.
- Kept the verified full matrix upsert and DB readback check because it protects real schedule coverage data.
- Removed success trace logging; only real save and Supabase failures emit console errors.

## Result

Coverage now follows one direct path:

```txt
coverage control -> restaurantSetup.coverageRequirements -> full matrix payload -> Supabase upsert -> DB readback verification
```
