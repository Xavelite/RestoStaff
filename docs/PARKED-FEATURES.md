# Parked features

The capabilities below are deliberately absent from the active product flow.
Only domain structures that still support current workflows or a concrete
future integration are retained. Nothing here is exempted from the dead-code
gate.

**These are parked, not dead.** Do not expose them without a concrete product
or integration requirement.

| Module | What it does | Why it is parked |
| --- | --- | --- |
| Advanced employee tax, benefit and regime-evidence editing | Tax profiles, benefits, exceptional evidence and provider reconciliation inputs. | The data structures are preserved, but they should not return to the active employee flow without a concrete estimation or provider-export requirement. |

## Also removed outright

These were chrome for the retired design with no behaviour of their own, and
were deleted rather than parked: `PageScaffold`, `HeroReadiness`, `Panel`,
`SaveActions`, `SetupGuide`, `ExportDialog`, the `OperationsBoard` set
(`BoardFocus`, `CoverageLensFrame`, `StaffChip`, `RailExportCard`),
`WeekHistory`, `TeamAccessPanel`, `CostInsights`, the obsolete guided-tour
stack, the retired payroll workspace/setup/details and payroll-export UI
utilities, `motion/countUp`, the weather card (`WeatherIcon`,
`restaurant-weather`), and `static/module-backgrounds/`.

Active operational replacements live in `src/lib/classic/` and the new module
pages. Intentionally retired surfaces above have no runtime callers.
