# restogogo — private pilot onboarding guide

This guide is for a restaurant testing the current prototype loop:

**Team + Restaurant setup → Planning → Badge Terminal → Actuals → Export**

The pilot is intentionally focused. Inventory, dashboard, daily close, full authentication and final payroll integrations are not part of this version yet.

## Private pilot note

This pilot build is shared only for testing and feedback. Please do not copy, redistribute, share screenshots publicly, or reuse the product concept/design without permission.

## Recommended setup before the first test

1. Run the Supabase schema SQL if this is a fresh database.
2. Optional: run the Bouillon seed SQL for the Bouillon pilot setup: 24 employees, 12 operational zones, 5 positions and PIN `0000` for each employee. Without the seed, create at least one employee, one zone and one position from the app.
3. Open the Bouillon workspace.
4. Check **Restaurant** setup: zones, positions and opening hours.
5. Check **Team** setup: active employees, PINs, payroll readiness and absences.
6. Check that Planning opens on next week once setup is complete.
7. Check that Actuals opens on the current week.
8. Open Badge Terminal from Actuals on the terminal window that employees will use.

## Manager test flow

### 1. Prepare setup

- Open **Restaurant**.
- Confirm active zones and opening hours.
- Open **Team**.
- Confirm active employees and temporary PINs.

### 2. Prepare planning

- Open **Planning**.
- Build the schedule for next week.
- Use filters/search if needed.
- Publish the schedule when it is ready.

### 3. Open the badge terminal

- Open **Actuals**.
- Click **Badge terminal**.
- Keep that window open on the terminal device.
- Employees should not use the manager Planning/Actuals pages.

### 4. Let employees badge

- Employee taps their own name.
- Employee enters their PIN.
- The terminal records check-in or check-out.
- If camera permission is available, a low-resolution photo proof is captured.
- Wrong PIN shows branded error feedback.

### 5. Review actuals

- Open **Actuals**.
- In the current view, only relevant employees appear:
  - planned employees
  - employees who badged
  - live/open entries
- Review missing badges, missing clock-outs, unplanned badges and variances.
- Click the photo proof marker on an actual card when proof is available.

### 6. Export for review

Use Actuals actions:

- **Export payroll prep** — one row per relevant employee.
- **Export weekly summary** — summary by employee.
- **Export details** — one row per planned/badged slot.
- **Export anomalies** — only missing badges, missing clock-outs, unplanned badges and large variances.
- **Print view** — browser print of the weekly grid.

## What to observe during the pilot

- Did managers understand Team and Restaurant setup without too much explanation?
- Did employees understand the badge terminal without explanation?
- Did anyone badge under the wrong name?
- Did managers immediately understand Actuals?
- Were missing badges and open clock-outs clear?
- Were the exports useful enough for weekly review/payroll preparation?
- What information is missing before this can be used daily?

## Temporary access

Current pilot build access is intentionally simple:

- Owner/manager login name: `manager`
- Owner/manager PIN: `0000`
- Employee PIN: temporary PIN configured in Team; seed uses `0000`

Full authentication and proper restaurant/user permissions are still a later phase.
