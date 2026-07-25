# Core workspace audit and alignment

**Baseline audited:** commit `60381533419b5ee801ace034785b81165b0f6c27` plus the supplied workspace patch.  
**Database reviewed:** connected RestoGogo DEV project.  
**Production:** not read from or changed by this alignment pass.

## Product boundary

RestoGogo is the operational source of truth for restaurant setup, people, planning, badge evidence, actual worked time, payroll preparation, useful labour-cost estimates and provider exports.

RestoGogo does **not** replace a Belgian social secretariat. Official gross-to-net calculation, taxes, social-security settlement, definitive payslips, statutory corrections and declarations remain outside the product unless a later integration merely exchanges data with the responsible provider.

Dimona is a separate integration boundary. Restaurant and Team store the employer and worker facts needed to prepare declarations; Schedule will own planned work periods; a future Dimona adapter will own submission status, references, errors, retries and audit history. Actual worked time remains Timesheet evidence and must never be reused as the declaration model.

## Source of truth

| Concept | Canonical owner | Canonical persistence |
| --- | --- | --- |
| Restaurant display identity | Restaurant | `restaurants.name` |
| Legal company identity | Restaurant | `restaurants.legal_name`, `company_number`, address/contact fields |
| Employer and Dimona preparation | Restaurant | `restaurant_employment_settings` |
| Areas and their visual identity | Restaurant | `work_areas`, with colour in `work_areas.metadata.color` |
| Positions and their visual identity | Restaurant | `job_functions`, with colour in `job_functions.metadata.color` |
| Services and opening times | Restaurant | `services`, `opening_hours`, `area_service_defaults` |
| Required staffing | Restaurant | `coverage_requirements`, explicitly by weekday and service |
| Person and contact data | Team | `employees`, `employee_contact_details` |
| App and badge access | Team | `employee_access`, memberships and invitation lifecycle |
| Current contract facts | Team | `employee_contracts` |
| Payroll-preparation employment facts | Team | versioned `employee_employment_terms` |
| Planned work | Schedule | `planned_shifts`, work-week lifecycle |
| Badge and actual work evidence | Time & attendance | `time_entries`, break intervals and adjustment history |
| Secretariat-ready time export | Payroll preparation | approved Timesheet evidence plus immutable export lineage |
| Official payroll and declarations | External provider / authority | not a Restogogo source of truth |

## Implemented alignment

### Shell and Home

- Retained one authenticated classic workspace shell, one navigation registry and one route-role contract.
- Kept unsaved-draft protection across navigation, restaurant switching, preview, terminal and sign-out transitions.
- Limited daily navigation to the operational core.
- Marked Reports and future restaurant modules as Home-only roadmap items until their contracts exist.
- Renamed the owner module to **Payroll preparation** and reduced it to Overview, Employees, Exports and Scope & settings.

### Restaurant

- Separated the restaurant's display name from its legal company name.
- Added owner-only employer preparation: ONSS employer number, establishment unit, joint committee, intended Dimona workflow, social-secretariat name and provider employer ID.
- Kept Belgium as the explicit first-market constraint: country `BE`, timezone `Europe/Brussels`, locale `fr-BE` and currency `EUR` remain deliberate defaults.
- Moved area colours from browser storage into database metadata. Colours are now shared across users and devices and travel through the same Restaurant save contract.
- Kept coverage explicitly scoped by weekday and service.
- Preserved logo upload and the existing storage hardening.

### Team

- Replaced the split client save sequence with one atomic `save_team_workspace` call. Core employee rows, contacts, access, positions, recurring schedule, legal data, contracts, payroll profiles and changed employment terms now succeed or fail together.
- Preserved manager restrictions: managers can maintain operational people/contact/access data but cannot submit owner-only legal, contract, wage or employment-term data.
- Kept normalized payroll classifications server-derived. The browser submits facts; PostgreSQL derives duration, employment regime, volume, legal schedule, CP 302 category and default worker status.
- Preserved NISS/BIS normalization and the official modulo-97 validation for new or changed values.

### Payroll preparation

- Replaced the active gross-to-net run dashboard with a preparation overview.
- Made employer readiness, employee readiness, approved-hours export and ownership boundaries the primary workflow.
- Preserved the former calculation/reconciliation UI under the unlinked `/payroll/advanced` route so the work is not destroyed while the final estimation scope is designed.
- Kept approved-hours exports as a core feature because they directly reduce social-secretariat preparation work.

### Repository and database consistency

The connected DEV database already contained six later migrations that were absent from the supplied repository. Their reviewed migration files are now present in source control order:

1. `20260725043310_team_restaurant_dimona_baseline.sql`
2. `20260725045433_team_restaurant_integrity_guards.sql`
3. `20260725045525_team_atomic_write_surface.sql`
4. `20260725050502_restaurant_logo_listing_hardening.sql`
5. `20260725052018_team_restaurant_query_hygiene.sql`
6. `20260725135631_niss_change_validation.sql`

No migration was re-applied to DEV because those versions were already recorded there. Production was not changed.

## Team field decisions

### Keep in the main Team table

- employee name;
- email and phone;
- primary position;
- active/access state;
- contract type;
- scheduling method;
- concise payroll-readiness status.

### Keep in employee Details

- address, emergency contact and notes;
- legal identity and NISS/BIS;
- contract dates, hours, days and leave entitlement;
- all active positions and primary-position assignment;
- fixed recurring schedule or weekly-availability method;
- badge/access and invitation state;
- social-secretariat employee identifier.

### Keep as payroll preparation

- employment type and current contract facts;
- weekly-hours definition and reference period;
- official CP 302 function and server-derived category;
- salary basis and contractual rate when needed for estimates/export;
- employee-specific estimated cost override;
- provider mapping and preparation notes.

### Derive automatically

- contract duration kind;
- ordinary, flexi, student, occasional or self-employed payroll regime;
- full-time/part-time employment volume;
- fixed/variable legal schedule;
- CP 302 category and default worker status;
- employment-term validation/source status;
- readiness summaries and anomalies.

### Compatibility fields to consolidate later

These are kept to avoid destructive migration during this pass, but they must not be presented as equal sources of truth:

- `employee_contact_details.phone` and `mobile_phone` are currently mirrored; mobile phone should become the single operational contact field.
- `worker_status` exists on the current contract and versioned employment terms; versioned/server-derived employment terms are canonical for payroll preparation.
- annual leave entitlement exists in contract and employment terms; an explicit operational entitlement owner is still needed.
- `employee_payroll_profiles.hourly_wage_rate` is a legacy budgeting field; contractual wage belongs to employment terms.
- position estimated cost is a restaurant default; employee estimated cost is an override.

The current `EmployeeDraft` remains a broad edit aggregate for compatibility. The next internal refactor should split it into person, contact, access, contract, scheduling and payroll-preparation section adapters while preserving the single atomic save transaction.

## Lifecycle decision

Removing an employee row must not become an implicit hard delete. The durable model should expose explicit actions:

- **Deactivate access**: stops application/badge access without ending employment.
- **Terminate employment**: records an end date and closes current employment terms.
- **Archive person**: hides a historical employee from the active roster while preserving planning, time and export lineage.

Until that lifecycle is implemented, the existing active flag remains the compatibility mechanism. Historical rows and payroll/time evidence must never be deleted by ordinary Team editing.

## Dimona-ready boundary

### Stored now

- company number, ONSS employer number and establishment unit;
- joint committee and intended submission route;
- employee NISS/BIS and basic legal identity;
- employment category, contract dates, current hours and CP 302 classification;
- planned shifts separately from actual worked time.

### Add only when building the integration

- declaration/outbox table with idempotency key;
- declaration type and planned start/end period;
- employment category payload snapshot;
- queued, submitted, accepted, rejected, corrected and cancelled statuses;
- authority/provider reference, error code and human-readable error;
- immutable submission attempts and actor/audit history;
- provider adapter, certificate/mandate configuration, retries and reconciliation;
- correction flow when the final plan differs from the last accepted declaration.

### Never infer

- Do not create Dimona from actual clock times.
- Do not treat a saved schedule as proof that an authority accepted a declaration.
- Do not store external API credentials in browser-visible restaurant settings.
- Do not claim official payroll accuracy from a Restogogo estimate.

## Remaining priorities

1. Split the Team details UI into clear Basic, Employment, Scheduling, Access and Payroll preparation sections without changing the atomic persistence contract.
2. Implement explicit deactivate/terminate/archive lifecycle actions and historical effective dates.
3. Audit Schedule, Badge terminal and Time & attendance against the same ownership model, then define the planned-shift-to-Dimona outbox boundary.
4. Add provider-specific export mappings only from an actual social-secretariat specification; keep the canonical internal export provider-neutral.

## Validation

- 116 Node/source/product-contract tests passed.
- TypeScript `tsc --noEmit` passed.
- All 87 Svelte files parsed successfully with the Svelte compiler.
- Full `npm run validate` could not be completed in the supplied Linux sandbox because the uploaded dependency tree lacked optional native Linux packages (`@rolldown/binding-linux-x64-gnu` and `@deno/linux-x64-glibc`). A clean dependency reinstall was attempted but the package registry returned HTTP 503 for one package. This is an environment/dependency-install limitation, not a reported source failure.

## Rollback and promotion

- Application changes are file-level and can be reverted as one commit or by restoring the supplied baseline.
- Database migrations are additive and already applied to DEV. Roll back through a reviewed forward migration rather than rewriting migration history.
- Replay the complete migration sequence on a disposable Supabase project before Production promotion.
- Regenerate Supabase TypeScript types from the target project during release verification.
- Production remains untouched until the source, disposable replay and hosted acceptance checks are explicitly approved.
