# Bouillon pilot script

A simple script for the first real test.

## Before the test

- Run the Supabase relational schema SQL if needed.
- Run the Bouillon seed SQL if you want starter pilot data; otherwise create the first employee, zone and position in the app.
- Use the **Bouillon Bruxelles** workspace.
- Confirm employees are present in **Team**.
- Confirm zones/positions/opening hours are present in **Restaurant**.
- If either module is empty, Planning must stay empty/strict; create the missing Supabase master data first.
- Confirm planning/actuals/availability are empty before starting, or run the operational cleanup SQL intentionally.

## Test session

1. Manager logs in with `manager` / `0000`.
2. Manager reviews Team quickly.
3. Manager reviews Restaurant setup quickly.
4. Manager creates next week's Planning.
5. Manager opens Actuals.
6. Manager opens Badge Terminal from Actuals in a new window.
7. One or two employees badge in and badge out.
8. Manager reviews Actuals.
9. Manager exports payroll prep and anomalies.
10. Manager shares feedback naturally by WhatsApp, email or conversation.

## Success criteria

- Employee can badge without help.
- Manager understands Team and Restaurant setup logic quickly.
- Manager understands the Actuals page in less than one minute.
- Missing badge / open checkout / unplanned badge states are clear.
- Export files are understandable enough for payroll/manager review.
- Data remains saved after refresh/relogin.
- No global page scroll bugs on desktop.
