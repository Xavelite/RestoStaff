# Payroll calculation foundation

> **Experimental foundation, not the active product contract.** The active module is **Payroll preparation**: employer and employee facts, approved-hours exports, provider mappings and clearly labelled estimates. The calculation/reconciliation structures below are preserved for controlled experiments and future provider integration; they must not be presented as official payroll or as a replacement for a Belgian social secretariat.

Restogogo can calculate CP 302-oriented estimates from approved Timesheet evidence. It does not submit Dimona or DmfA declarations, issue payslips, settle taxes or social security, or replace a Belgian social secretariat.

## Product workflow

1. Team records employment facts: employment type, contract dates and hours, hours definition, scheduling policy, wage, and an official CP 302 function.
2. `save_employee_employment_terms` derives duration, payroll regime, employment volume, legal schedule, category, and default worker status inside PostgreSQL. A normal save is `recorded`; a separate audited validation operation may mark it `complete` or `verified`.
3. Timesheet closes badge sessions, confirms the actual function and area, positions exact breaks, and approves weekly actuals.
4. The monthly payroll gate checks every worked date independently of Timesheet's Monday-Sunday weeks.
5. `calculate_payroll_run` freezes the approved inputs, hashes them, and creates component lines in integer euro cents.
6. The owner reviews an estimate and may lock it for operational reference. Only provider-reconciled evidence can become finalized payroll.
7. Provider-neutral components can be mapped, exported, imported, and reconciled when the pilot social-secretariat specification is available.

Payroll remains inside the current product architecture: employee setup in Team, restaurant setup in Restaurant, calculation/review in Time & attendance, and temporary owner-only labour-cost analysis in Reports.

## Team employment model

The ordinary Team form exposes only business facts:

- employment type: CDI, CDD, Flexi-job, Student, Extra, Freelancer, or a restaurant custom type;
- start and applicable end date;
- contract hours per week and either fixed weekly hours or a variable average over a reference period;
- recurring fixed schedule, weekly availability, or manager-planned scheduling;
- contract working days and annual leave;
- hourly or monthly salary and an official searchable CP 302 function.

The browser never submits normalized duration, payroll regime, volume, legal schedule, CP 302 category, worker status, or verification status. The server derives them. The CP 302 catalogue carries French, Dutch, and English names plus the default blue-collar/white-collar status. Exceptional status overrides require a reason and a new effective-dated version.

CDI derives indefinite and ordinary terms with no end date. CDD derives fixed-term ordinary terms and inherits the contract end. Flexi-job, Student, Extra, and Freelancer derive flexi, student, horeca-occasional, and self-employed base regimes respectively. Student and Extra contribution treatments remain period decisions based on evidence; they are not employee identities.

## Authority and access

- PostgreSQL RPCs are authoritative. Browser calculations are display-only.
- Payroll, tax, bank, national-registry, salary, and provider data are RPC-only and owner-only.
- Managers can confirm operational worked-time evidence: actual function, work area, and exact break intervals.
- Employees and ordinary managers cannot read payroll results or sensitive profiles.
- Historical terms, break evidence, component sources, runs, exports, and return files are append-only or superseded by a new version.
- Managers receive no salary or cost rates. `get_insights_cost_rates` checks owner authority and never substitutes hourly wage for a missing estimated employer cost.
- Finalized payroll runs cannot be changed or deleted. The status path is `calculated -> reviewed -> locked_estimate`; provider evidence permits `reviewed/locked_estimate -> reconciled -> finalized`.

## Implemented rule catalogue

| Rule | Formula | Effective | Official source | Status |
| --- | --- | --- | --- | --- |
| `CP302_MINIMUM_SCALE_2026` | Most favourable of contractual hourly equivalent and category I-IX scale for function seniority | 2026-01-01 | Official CP 302 minimum-wage table | Effective |
| `ORDINARY_EMPLOYEE_ONSS` | 13.07% of the applicable social-security base | 2026-01-01 | ONSS administrative instructions 2026/2 | Effective, before work bonus |
| `ORDINARY_EMPLOYER_BASE` | 24.92% base employer contribution | 2026-01-01 | ONSS administrative instructions 2026/2 | Estimated employer base; category additions/reductions unresolved |
| `BLUE_COLLAR_108_BASE` | Ordinary blue-collar remuneration x 108% for contribution base | 2026-01-01 | ONSS administrative instructions 2026/2 | Effective |
| `BLUE_COLLAR_VACATION_QUARTERLY` | 5.57% of the 108% base | 2026-01-01 | ONSS administrative instructions 2026/2 | Effective |
| `BLUE_COLLAR_VACATION_ANNUAL` | 10.27% provision on the 108% base | 2026-01-01 | ONSS administrative instructions 2026/2 | Provision, not a declaration |
| `FLEXI_MINIMUM_HORECA` | At least EUR 11.87/hour plus separate holiday pay | 2026-03-01 | ONSS flexi instructions 2026/2 | Effective through 2026-08-31; future index must be added before September payroll |
| `FLEXI_HOLIDAY_PAY` | 7.67% of flexi base salary | 2026-01-01 | ONSS flexi instructions 2026/2 | Effective |
| `FLEXI_EMPLOYER_CONTRIBUTION` | 28% of flexi salary including holiday pay | 2026-01-01 | ONSS flexi instructions 2026/2 | Effective |
| `STUDENT_EMPLOYEE_SOLIDARITY` | 2.71% of remuneration | 2026-01-01 | ONSS student instructions 2026/2 | Effective only with verified eligibility/quota evidence |
| `STUDENT_EMPLOYER_SOLIDARITY` | 5.42% of remuneration | 2026-01-01 | ONSS student instructions 2026/2 | Effective; separate asbestos-fund timing unresolved |

Sources retained in `payroll_legal_sources` include their URL, retrieval date, content hash where available, effective rule linkage, and verification notes. Seeded salary scales contain 414 points: 46 function-seniority years across categories I-IX.

## Calculation lineage

Every run freezes an input JSON snapshot and SHA-256 hash. Base component lines link to the exact time-entry revision, active break intervals, employment-term version, rule, and legal source. Social contribution lines are grouped by employee, exact employment-term version, period contribution treatment, salary basis, and worker status. Benefits, adjustments, and manual withholding link to their own effective-dated evidence. The Timesheet component drill-down shows quantity, rate, explanation, rule, legal source, terms version, rounding, and frozen sources.

Money uses PostgreSQL `numeric` and integer euro cents. TypeScript accepts and formats decimal strings or `bigint`; authoritative monetary arithmetic never uses JavaScript floating point.

## Readiness blockers

A run cannot calculate while there are open entries, unresolved overlaps, unapproved Timesheet weeks, aggregate-only breaks, unconfirmed function/area, unverified effective terms, missing classification or wage data, or missing verified flexi/student/occasional evidence. Monthly-paid employees are blocked because lawful monthly proration is not implemented; badge minutes are never used as a substitute monthly base. Missing verified tax data remains a visible warning because net salary is still estimated.

## Reports cost estimate

The owner-only Cost tab uses `employee_payroll_profiles.estimated_hourly_cost` as the explicit `estimated_profile_rate` source. Planned cost uses scheduled duration because planned breaks are not recorded. Worked cost uses only closed or adjusted entries, deducts recorded break minutes, and excludes open, cancelled, invalid, duplicate, and overlapping entries. Missing rates are excluded and reported through worked-hour coverage and active-employee counts. These values are pre-payroll estimates, not calculated or reconciled payroll.

## Deliberately unresolved legal handlers

The schema and typed rule catalogue reserve these areas, but they are not activated without official, effective evidence and golden cases:

- part-time complementary-hour credits and reference-period exhaustion;
- ordinary, voluntary, and special horeca/GKS overtime classification;
- night, Sunday, public-holiday, and premium cumulation/difference rules;
- sickness, relapse, guaranteed salary, holiday pay, replacement holidays, and compensatory-rest ledgers;
- official work-bonus and FPS Finance professional-withholding formulas;
- employer category additions, reductions, sector pension, Social Fund, insurance, and year-end provisions;
- occasional-worker forfaits and quota fallback;
- interim provider cost and freelancer invoice-only treatment;
- the 2026-09-01 flexi index announced in the ONSS intermediate instructions;
- pilot-specific provider rubrics, file format, return format, and validated reference results.

These items must remain draft or readiness-blocked. They must not be inferred from UI labels or restaurant guesses.

## Provider reconciliation

The database supports provider definitions, effective component mappings, employee identifiers, immutable JSON exports and hashes, original return payloads, per-component variances, explanations, and accepted/resolved states. A run can be marked reconciled only when no open variance remains. The pilot's approximate 62 rubrics must be imported as provider mappings, not treated as universal Belgian formulas.

## Validation

- `tests/payroll-engine.test.mjs` covers decimal parsing, exact minute amounts, basis-point rounding, and locale formatting.
- `tests/dashboard-cost.test.mjs` covers planned and worked cost, break deductions, comparison, missing-rate coverage, exclusions, and filters.
- `supabase/tests/employment_derivation_contract.sql` executes the six employment-type mappings, CP 302 derivation, contract ownership, salary-basis rejection, CDD validity, recorded status, and effective version closure.
- `supabase/tests/payroll_engine_contract.sql` creates synthetic tenant evidence, records an exact break, calculates exact ordinary results, verifies contribution lineage and security grants, rejects estimate finalization, and proves finalized-run immutability inside a rollback.
- `scripts/verify-linked-database.ps1` runs the payroll contract with the other linked DEV database checks.
- `npm run validate` covers application tests, Svelte/TypeScript, Edge Functions, dead code, and the Vercel build.

## Migration and rollback notes

Migrations `202607230048` through `202607230061` are additive and applied to DEV only. V575 established the payroll foundation. V576-V581 add the official function catalogue, exact contract ownership, server derivation and validation evidence, period contribution treatment, honest estimate/final statuses, owner-only Insights rates, the reconciliation transition correction, and explicit review status for preserved V575 owner-saved terms. Replay the complete sequence on a disposable project before production promotion. Because these migrations preserve immutable payroll history, rollback means restoring the pre-payroll database backup or applying another reviewed forward migration; do not drop or rewrite calculated evidence in place.
