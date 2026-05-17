# Architecture — v428.6 baseline

## Coverage contract

Coverage remains relational and explicit:

```txt
Zone × Service × Position = Required count
```

Source-of-truth table:

```txt
restogogo_zone_coverage_requirements
```

Runtime source:

```txt
restaurantSetup.coverageRequirements
```

## Save path

Coverage editing now has one source-of-truth flow:

```txt
coverage input
→ direct runtime coverage cell update
→ full matrix payload
→ Supabase upsert with returned rows
→ DB readback verification
```

Zones do not own staffing services or default positions anymore. Zones own identity/status/default times. Coverage owns expected staffing.
