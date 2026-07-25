# Parked features

Retiring the second design deleted the only screens that reached the modules
below. The code is kept verbatim so the work is not lost, and is listed in
`knip.json`'s `ignore` so the dead-code gate stays honest about the rest of the
tree.

**These are parked, not dead.** Each one is a feature the product had and does
not currently expose. Delete an entry only when the feature is deliberately
abandoned — not merely because nothing imports it yet.

| Module | What it does | Why it is parked |
| --- | --- | --- |
| `src/lib/tour/**` | Guided per-page walkthrough: the `?` button, the spotlight overlay and the per-page scripts. | The button and overlay lived in the retired shell, and the scripts target `data-tour` anchors on pages that no longer exist. Needs its scripts rewritten against the new pages before it can be mounted again. |
| `/payroll/advanced/**`<br>`payroll/PayrollWorkspace.svelte`<br>`payroll/RestaurantPayrollSetup.svelte` | Gross-to-net estimates, immutable runs, CP 302 rule setup, provider return files and reconciliation. | Preserved under an unlinked experimental route. It is intentionally not the active product workflow because Restogogo is payroll preparation, not a social secretariat. |
| `schedule/schedule-export.ts`<br>`schedule/schedule-export-columns.ts` | Configurable schedule export. | Schedule export is not yet remounted in the rebuilt workspace. Payroll approved-hours export remains active because it directly serves social-secretariat preparation. |
| `operations/RevisionConflictDialog.svelte` | The optimistic-concurrency conflict flow when two people save the same week. | The new pages surface a `CONFLICT:` save as a toast instead. The data is still safe — the server rejects the stale write — but the user gets a terser message rather than the reload/compare dialog. |
| `team/LeaveBalanceSummary.svelte` | Leave balance card (entitlement, taken, remaining). | No equivalent on the new Team pages yet. |
| Advanced employee tax, benefit and regime-evidence editing | Tax profiles, benefits, exceptional evidence and provider reconciliation inputs. | The data structures are preserved, but they should not return to the active employee flow without a concrete estimation or provider-export requirement. |

## Also removed outright

These were chrome for the retired design with no behaviour of their own, and
were deleted rather than parked: `PageScaffold`, `HeroReadiness`, `Panel`,
`SaveActions`, `SetupGuide`, `ExportDialog`, the `OperationsBoard` set
(`BoardFocus`, `CoverageLensFrame`, `StaffChip`, `RailExportCard`),
`WeekHistory`, `TeamAccessPanel`, `CostInsights`, `motion/countUp`, the weather
card (`WeatherIcon`, `restaurant-weather`), and `static/module-backgrounds/`.

Their replacements live in `src/lib/classic/` and the new module pages.
