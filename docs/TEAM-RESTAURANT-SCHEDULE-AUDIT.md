# Team, Restaurant and Schedule alignment audit

## Product rule

Restogogo uses progressive setup. A restaurant or employee can be created before legal, employment, scheduling, payroll or integration data is complete. Optional data produces readiness warnings and only becomes mandatory for the action that needs it.

## Team

### Save contract

- The only required employee field is `display_name` (the full name shown in the workspace).
- Empty draft rows are ignored and never create related contact, contract, access or payroll records.
- Contact, legal, contract, payroll, access and changed employment-term data save through the single atomic `save_team_workspace` RPC.
- A failure rolls back the whole submitted Team save; the UI does not report a partially saved employee.
- Temporary failure to load the optional payroll catalogue does not block ordinary Team changes.

### Non-blocking readiness

The following are optional during creation and ordinary editing:

- email and phone;
- address and emergency contact;
- NISS/BIS number and birth data;
- contract type, dates, hours and working days;
- CP302 function and worker classification;
- wage, estimated cost and social-secretariat mapping;
- invitation and badge access.

An entered invalid NISS/BIS value remains editable and is shown as a warning. A valid official identifier is still required before Dimona or another official workflow can claim readiness.

### Removal and archive

- A new unsaved employee row can be removed immediately.
- A saved employee is archived rather than physically deleted.
- Archiving preserves historical planning, attendance, absence and export evidence.
- The DEV database archive trigger disables badge/access, deactivates recurring schedule slots and revokes pending invitations.
- Archived employees can be restored. They remain visible in historical schedules when they have shifts in the selected week.

### Remaining intentional blockers

- A blank employee full name cannot be saved.
- Only an owner can change owner-only legal or payroll-preparation fields.
- Sending an invitation requires a usable email address.
- An entered contract end date cannot precede its start date.

## Restaurant

### Save contract

- The only required restaurant identity field is the display name.
- Legal name falls back to the display name.
- Enterprise, ONSS and establishment identifiers are optional setup data.
- Incomplete empty Area, Position and Coverage draft rows are ignored rather than blocking the whole Restaurant save.
- Area and Position codes are generated automatically.
- Opening hours and coverage can be configured later.

### Non-blocking readiness

Belgian enterprise number, establishment unit and joint-committee formatting is shown as inline guidance. Draft values do not prevent the restaurant identity, opening hours, areas or positions from saving. Official integrations may later require valid values.

### Removal and archive

- New unsaved Areas and Positions can be removed immediately.
- Saved Areas and Positions use Archive/Restore, preserving references from historical shifts and time entries.
- Removing a new draft Area or Position also removes its unsaved coverage references.
- The Coverage matrix is restored as the canonical weekday/service/area/position setup surface.

### Remaining intentional blockers

- A blank restaurant display name cannot be saved.
- Only owners can persist Restaurant configuration.
- A complete Coverage row must reference an existing Area, Position and Service.

## Home

- Home remains a lightweight module portal rather than a second dashboard.
- Operational core modules stay prominent: Schedule, Time & attendance, Team, Restaurant, Payroll preparation and Badge terminal.
- Future modules remain visually separate and do not create setup blockers for the pilot.
- Dead Schedule Coverage navigation was removed; coverage belongs to Restaurant.

## Schedule

### Workspace alignment

- Schedule now uses the same compact panel, dirty-state save and discard contract as Team and Restaurant.
- The oversized standalone filter/action toolbars were removed.
- Search, Position and Conflict filters live in the Employee header.
- Week navigation, status, density and publish actions sit in the panel header.
- Secondary actions such as copy and CSV export live in the overflow menu.

### Grid

- The separate `PLANNED` totals row was removed.
- Day headers show planned hours and shift count.
- Employee rows show scheduled versus contract hours and a progress meter.
- Area metadata controls the shift accent/tint; Position is a secondary label.
- Compact mode shows time, duration and area.
- Detailed mode adds position, service and estimated cost.
- Absence/unavailability uses a striped treatment; conflicts use a red boundary and warning icon.
- Employee column and day headers remain sticky.
- Empty cells create shifts; existing shifts can be dragged between free employee/day cells.

### Save and publish boundary

- Draft saving is allowed with operational warnings.
- Structurally invalid shift times remain a hard blocker.
- Revision conflicts remain a hard blocker to prevent overwriting another manager's changes.
- Coverage, availability and contract-hour concerns remain review/publish warnings and use the existing override flow where allowed.

## Database migration

`20260725193000_progressive_setup_and_employee_archive.sql` was applied to DEV only.

It:

- removes creation-time format constraints for optional NISS, enterprise and establishment draft values;
- adds a reusable official Belgian NISS validity helper;
- limits NISS uniqueness to valid official identifiers;
- adds history-safe employee archive side effects.

Production was not changed.

## Validation

- 121 Node/product-contract tests pass.
- All 86 Svelte components compile with the Svelte compiler without warnings.
- `git diff --check` passes.
- Full native-backed `svelte-check`/build must be repeated after a clean dependency install on the target OS; the sandbox lacked the Linux optional Rolldown binding and could not reach the package registry.

## Deferred findings

Supabase advisors still report broad pre-existing security/performance notices, primarily direct-table RLS-without-policy notices in an RPC-first architecture, SECURITY DEFINER grant review items, optional-auth hardening and missing/unused index candidates. They were not changed during this UX/persistence pass because a blanket fix could break the established RPC permission model. They should be handled in a dedicated security and query-plan audit before production expansion.
