# v2 manual test checklist

## Login

- Dev gate unlocks with `admin` / `0000`.
- Restaurant login accepts owner / employee identities with PIN `0000`.
- Login page remains visually consistent and no app shell leaks behind it.

## Employee schedule

- Week metric opens the date picker.
- Previous/next week work.
- Draft availability toggles work.
- Time edit prompt works.
- Published schedule prevents draft availability edits and allows swap request flow.
- User pill logs out to login.
- Notification popover uses v2 styling.

## Owner planning

- Week metric opens the date picker.
- Previous/next week work.
- Row selection toggles only from employee identity cell.
- Column selection toggles from day header.
- Slot clicks add/remove shifts without changing row selection.
- Zone dropdown opens/closes and updates zone.
- Time edits validate and save.
- Filters/search/actions work and close on outside click/Escape.
- Conflict count flashes when it changes.
- Publish/unpublish hover states and centered confirmation message work.
- Page itself does not vertically scroll; calendar scrolls internally.

## Technical checks

- Browser console has no runtime errors.
- Active CSS has no `!important`.
- No legacy UI appears on reviewed v2 pages.
