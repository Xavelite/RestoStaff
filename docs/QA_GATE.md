# QA gate - v428.6 coverage editor binding cleanup

## Required test

- [ ] Deploy v428.6 files.
- [ ] Hard refresh the browser.
- [ ] Open Restaurant -> Operations -> Zones.
- [ ] Change `AC / Lunch / Maitre d'hotel`.
- [ ] Save.
- [ ] Confirm no save error appears.
- [ ] Refresh the app.
- [ ] Confirm the coverage value remains saved.
- [ ] Confirm the Supabase row is updated for `ac / Lunch / maitre-d-hotel`.

## Regression checks

- [ ] Position setup still saves.
- [ ] Zone name/status/default times still save.
- [ ] Planning still saves shifts.
- [ ] Coverage warnings in Planning still render.
