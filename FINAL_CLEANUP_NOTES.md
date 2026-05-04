# v108 Final Local Cleanup Notes

This version keeps the current UI and behavior intact while tightening the remaining interaction issue.

## Fixed
- Owner position metric click now scopes scrolling to the active calendar, matching employee behavior.
- Prevents hidden calendars from stealing the target row during navigation.

## Confirmed
- UI remains unchanged.
- Active visible wording stays focused on planning, costs, and dashboard insights.
- Old payroll terminology remains only in architecture notes as historical cleanup context, not active UI.
- JavaScript syntax check passes with `node --check assets/js/app.js`.
