# Parked features

Retiring the second design deleted the only screens that reached the modules
below. The code is kept verbatim so the work is not lost, and is listed in
`knip.json`'s `ignore` so the dead-code gate stays honest about the rest of the
tree.

**These are parked, not dead.** Each one is a feature the product had and does
not currently expose. Delete an entry only when the feature is deliberately
abandoned — not merely because nothing imports it yet.

The retired design remains readable at `C:\dev\restogogo` (frozen at V594) if
you need to see how a screen used to wire one of these up.

| Module | What it does | Why it is parked |
| --- | --- | --- |
| `src/lib/tour/**` | Guided per-page walkthrough: the `?` button, the spotlight overlay and the per-page scripts. | The button and overlay lived in the retired shell, and the scripts target `data-tour` anchors on pages that no longer exist. Needs its scripts rewritten against the new pages before it can be mounted again. |
| `payroll/PayrollWorkspace.svelte`<br>`payroll/RestaurantPayrollSetup.svelte`<br>`payroll/EmployeePayrollDetails.svelte` | Payroll run calculation, CP 302 restaurant setup, per-employee employment terms editing. | The new Payroll pages are read-only summaries. Nothing currently *edits* employment terms or triggers a payroll run from the UI. This is the largest gap. |
| `payroll/payroll-export.ts`<br>`payroll/payroll-export-columns.ts`<br>`schedule/schedule-export.ts`<br>`schedule/schedule-export-columns.ts` | CSV/PDF export for payroll and the schedule, including the configurable column set. | The new design has no export action. Payroll → Exports only lists and re-downloads runs that already exist; it cannot build a new CSV with chosen columns. |
| `operations/RevisionConflictDialog.svelte` | The optimistic-concurrency conflict flow when two people save the same week. | The new pages surface a `CONFLICT:` save as a toast instead. The data is still safe — the server rejects the stale write — but the user gets a terser message rather than the reload/compare dialog. |
| `team/LeaveBalanceSummary.svelte` | Leave balance card (entitlement, taken, remaining). | No equivalent on the new Team pages yet. |

## Also removed outright

These were chrome for the retired design with no behaviour of their own, and
were deleted rather than parked: `PageScaffold`, `HeroReadiness`, `Panel`,
`SaveActions`, `SetupGuide`, `ExportDialog`, the `OperationsBoard` set
(`BoardFocus`, `CoverageLensFrame`, `StaffChip`, `RailExportCard`),
`WeekHistory`, `TeamAccessPanel`, `CostInsights`, `motion/countUp`, the weather
card (`WeatherIcon`, `restaurant-weather`), and `static/module-backgrounds/`.

Their replacements live in `src/lib/classic/` and the new module pages.
