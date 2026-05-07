# RestoStaff Manual Test Checklist — v198

Use this checklist before and after every code change. Mark anything that regresses and capture screenshots when possible.

Recommended browsers/devices:

- Desktop Chrome or Edge
- Desktop Safari if available
- Mobile iPhone Safari or responsive simulator
- Mobile Android Chrome if available
- Real tablet for terminal mode when possible

## 1. Load and storage

- [ ] App loads without a blank screen.
- [ ] Supabase cloud status appears and does not show an unexpected fatal error.
- [ ] Existing restaurant/workspace data loads.
- [ ] Refreshing the page keeps the same saved data.
- [ ] Incognito/new browser session loads shared Supabase data.
- [ ] No unexpected reset to default demo data.

## 2. Private gate and restaurant access

- [ ] First screen is the private RestoStaff dev gate only.
- [ ] Dev gate does not display the temporary username/password as helper text or placeholders.
- [ ] Wrong dev gate login shows a clear denial and does not enter.
- [ ] Valid dev gate login opens the neutral RestoStaff access page.
- [ ] No public restaurant/workspace card list is visible.
- [ ] Access page uses RestoStaff styling, not Bouillon-specific styling.
- [ ] Module preview uses compact visual tiles, not a long hero text block.
- [ ] Restaurant dropdown is visible and can select available prototype workspaces.
- [ ] Owner name + password/PIN enters the manager app for the selected restaurant.
- [ ] Employee name + password/PIN enters My Schedule for the selected restaurant.
- [ ] Wrong restaurant password/PIN shows a clear message and does not enter.
- [ ] Unknown name shows a clear message and does not enter.
- [ ] Employee login does not show manager tabs.
- [ ] Switch user returns to the neutral restaurant access page, not card-based restaurant selection.
- [ ] Direct route `?workspace=bouillon-bruxelles` still requires the dev gate first, then opens the correct restaurant access page.

## 3. Manager navigation

- [ ] Manager sees Planning.
- [ ] Manager sees Time Clock.
- [ ] Manager sees Inventory.
- [ ] Manager sees Costs.
- [ ] Manager sees Dashboard.
- [ ] Manager sees Setup.
- [ ] Notification bell is visible.
- [ ] Theme toggle works.
- [ ] Topbar remains compact on desktop.
- [ ] Topbar remains usable on mobile.

## 4. Employee mode

- [ ] Employee does not see manager/owner tabs.
- [ ] Employee does not see manager-only toolbar actions.
- [ ] Employee can view their relevant schedule.
- [ ] Employee availability controls work if schedule is unpublished.
- [ ] Employee notification bell remains relevant.
- [ ] Mobile employee view is usable and not cluttered.

## 5. Planning calendar desktop

- [ ] Monday to Sunday columns are visible or horizontally scrollable as expected.
- [ ] Lunch and Evening header rows are readable.
- [ ] First two calendar header rows stick correctly while scrolling.
- [ ] Employee column sticks on the left.
- [ ] Week total column sticks on the right.
- [ ] Shift cells are not overly compressed.
- [ ] Add shift works.
- [ ] Remove shift works.
- [ ] Assign/change zone works.
- [ ] Notes/info popup by day works.
- [ ] Publish works.
- [ ] Unpublish works.
- [ ] Copy schedule works.
- [ ] Copy previous week works.
- [ ] WhatsApp message button works.
- [ ] PDF/print button opens browser print/save-as-PDF flow.
- [ ] Show/hide zero-hour employees works.

## 6. Planning calendar mobile

- [ ] Calendar is horizontally scrollable.
- [ ] Sticky employee column does not cover too much content.
- [ ] Week total remains usable.
- [ ] Toolbar actions do not overlap.
- [ ] Calendar cells remain readable.
- [ ] No owner toolbar appears while logged in as employee.

## 7. WHO / WHERE metrics

- [ ] WHO position cards render correct hours.
- [ ] WHERE zone cards render correct hours.
- [ ] Hours use lowercase `h`.
- [ ] People count is subtle, for example `1p` or `2p`.
- [ ] Metric typography is not too heavy or billboard-like.
- [ ] Clicking a position opens/focuses the detail popup correctly.
- [ ] Clicking a zone opens/focuses the detail popup correctly.
- [ ] Clicking outside closes the metric popup.
- [ ] Metric popup does not immediately close because of event propagation.

## 8. Costs page

- [ ] Costs page loads without errors.
- [ ] Week/day selector matches planning behavior.
- [ ] KPI cards show sensible values.
- [ ] Total planned cost is correct enough for prototype testing.
- [ ] Total planned hours match planning.
- [ ] Staffed employee count is sensible.
- [ ] Average cost/hour is sensible.
- [ ] Highest-cost day/shift appears.
- [ ] Top cost position appears.
- [ ] Top cost zone appears.
- [ ] Stacked charts show colors correctly.
- [ ] Legends are centered/clean/readable.
- [ ] Quick insights look premium and readable.
- [ ] Day breakdown works.
- [ ] Employee workload and cost section works.
- [ ] Position breakdown works.
- [ ] Zone breakdown works.
- [ ] Modern Dark costs page is readable.

## 9. Dashboard

- [ ] Dashboard loads without errors.
- [ ] 4-week range works.
- [ ] 12-week range works.
- [ ] 52-week range works.
- [ ] Cost trend renders.
- [ ] Hours trend renders.
- [ ] Cost mix over time renders.
- [ ] Position evolution renders.
- [ ] Zone evolution renders.
- [ ] Empty or missing history states are understandable.

## 10. Setup and wizard

- [ ] Setup page loads.
- [ ] Restaurant name saves.
- [ ] Manager/owner name saves.
- [ ] City saves.
- [ ] Accent color saves and does not create ugly combinations.
- [ ] Logo/default logo behavior looks correct.
- [ ] Positions can be added/edited/removed safely.
- [ ] Zones can be added/edited/removed safely.
- [ ] Zone rules remain valid.
- [ ] Employees can be added/edited/deactivated.
- [ ] Planning rates save.
- [ ] Position colors save.
- [ ] Zone colors save.
- [ ] Setup wizard opens.
- [ ] Setup wizard steps work in order.
- [ ] Setup wizard apply/save works.
- [ ] Existing data is not unexpectedly destroyed.

## 11. Notifications

- [ ] Bell icon is a recognizable bell.
- [ ] Red badge appears only for urgent/action-required items.
- [ ] Yellow badge appears for informational items.
- [ ] Manager does not get noisy notifications for their own normal actions.
- [ ] Employee receives relevant schedule/swap notifications.
- [ ] Mark all read works.
- [ ] Notification popup opens and closes correctly.

## 12. Time Clock manager

- [ ] Time Clock tab opens on the landing/cards view.
- [ ] Terminal card opens wall terminal.
- [ ] Actual Timesheet card opens the timesheet subpage.
- [ ] Badge Monitor card opens the monitor subpage.
- [ ] Today’s date/time appears.
- [ ] Today’s entries show.
- [ ] Currently clocked-in employees show.
- [ ] Completed entries show.
- [ ] Photo thumbnails show when available.
- [ ] Clicking a thumbnail opens larger photo preview.
- [ ] Weekly actual hours page appears and Lunch/Evening blocks are clickable.
- [ ] Manager close/open-entry action works.
- [ ] Delete entry action works if used.
- [ ] Modern Dark Time Clock page is readable.

## 13. Terminal mode

Test terminal with the actual deployed terminal URL or `?terminal=1` / `#terminal` flow.

- [ ] Terminal opens full-screen.
- [ ] No Back to planner button is visible.
- [ ] No reset terminal button is visible.
- [ ] Header shows restaurant logo or fallback identity correctly.
- [ ] Header shows restaurant name.
- [ ] Employee list appears on the left.
- [ ] Default state says “Tap your name”.
- [ ] Default state is centered and premium.
- [ ] Selecting an employee shows PIN state.
- [ ] PIN pad is readable and usable.
- [ ] Wrong PIN shows red/error/shake feedback.
- [ ] Correct PIN automatically submits after 4 digits.
- [ ] Camera permission request is acceptable.
- [ ] If camera is allowed, photo proof is captured.
- [ ] If camera is denied/unavailable, clock-in/out still handles the situation gracefully.
- [ ] Check-in success says “Validated”.
- [ ] Check-in success says “Checked in at HH:MM”.
- [ ] Check-out success says “Validated”.
- [ ] Check-out success says “Checked out at HH:MM”.
- [ ] Success date line appears below the time.
- [ ] Green success card visually replaces the inner terminal card.
- [ ] Success card does not float over a duplicate grey card.
- [ ] Terminal auto-returns to default state after success.
- [ ] Second scan/PIN checks the employee out if they are already checked in.

## 14. Modern Light / Modern Dark

- [ ] Modern Light is clean, white/neutral, and premium.
- [ ] Modern Dark is a real dark design and readable.
- [ ] Theme toggle switches correctly.
- [ ] Restaurant accent color influences controls without overwhelming the UI.
- [ ] Logo is not forced into a circle/avatar when a full logo exists.

## 15. Regression notes

Record any issue here before requesting or applying another patch:

```txt
Date:
Version tested:
Device/browser:
Role/workspace:
Page/module:
Issue:
Screenshot/video:
Expected behavior:
Actual behavior:
```


## v159 Employee My Schedule

- [ ] Login as a normal employee opens `My Schedule` by default.
- [ ] Normal employees do not see the `Full Planner` tab.
- [ ] My Schedule shows Monday–Sunday with Lunch and Evening cards.
- [ ] Planned shifts show zone, precise time range, and hours.
- [ ] Change a precise time range in owner Planning and confirm My Schedule / Costs update.
- [ ] Draft week: tapping a card toggles availability.
- [ ] Published week: tapping an assigned card opens the existing swap/offer flow.
- [ ] Weekly summary shows total hours, shift count, next shift, and submitted status.
- [ ] My swaps list still shows employee swap actions.
- [ ] In Setup, set `Employee full planner` to Yes for one employee.
- [ ] That employee sees both `My Schedule` and `Full Planner`.
- [ ] Switching between Modern Light and Modern Dark keeps My Schedule readable.
- [ ] Owner Planning, Costs, Dashboard, Setup, and Time Clock still behave as before.


## v160 My Schedule polish

- [ ] Employee My Schedule opens by default.
- [ ] Restaurant-name workspace pill is gone from the topbar.
- [ ] Employee mode does not show owner top tabs.
- [ ] Small Draft/Published toolbar chip is hidden on My Schedule.
- [ ] Large My Schedule Draft/Published card is visible.
- [ ] Draft cells show short labels only: Available / Off.
- [ ] Tapping availability turns the cell green with feedback.
- [ ] Published cells show assigned zone or Off.
- [ ] Modern Light and Modern Dark both look clean.


## v177 Weekly Timesheet checks

- [ ] Manager Time Clock tab opens the landing page.
- [ ] Actual Timesheet card opens the weekly actual-hours page.
- [ ] Week label matches the selected planner week.
- [ ] Monday-Sunday are visible or horizontally scroll cleanly on smaller screens.
- [ ] Each day shows Lunch and Evening blocks horizontally.
- [ ] Day total appears when actual time exists.
- [ ] Terminal clock-in/out appears in the correct employee/day/shift block.
- [ ] Live entries show the compact LIVE badge.
- [ ] Clicking an empty Lunch/Evening block creates an actual entry.
- [ ] Clicking a filled Lunch/Evening block edits the entry.
- [ ] Today entries and photo proof still work in Badge Monitor.


## v177 Inventory checks

- [ ] Inventory tab is visible to managers/owners.
- [ ] Stock overview renders KPIs and low-stock alerts.
- [ ] Add item works and persists after reload.
- [ ] Edit item works.
- [ ] Stock In increases stock and records movement.
- [ ] Stock Out decreases stock and records movement.
- [ ] Waste decreases stock and records movement.
- [ ] Count corrects stock and records count movement.
- [ ] CSV export downloads.
- [ ] Modern Light and Modern Dark styles remain readable.


## v177 Daily Close checks

- [ ] Owner sees Daily Close tab.
- [ ] Employee does not see Daily Close tab.
- [ ] Date selector changes selected close.
- [ ] Payment method inputs save and persist.
- [ ] Opening float and actual cash save and persist.
- [ ] Expected cash and difference update correctly.
- [ ] Cash in / cash out / deposit / expense movements can be added.
- [ ] Movement can be deleted.
- [ ] Close day / reopen day works.
- [ ] Daily Close CSV downloads.
- [ ] Daily Close print report opens.
- [ ] Daily Close appears in Export Center.
- [ ] Supabase save status remains healthy.

## v198 first-page / access checks

- Fresh visit shows only the private development gate.
- Wrong dev-gate password does not open the app.
- Valid dev-gate access opens the neutral RestoStaff login.
- The access page uses RestoStaff styling, with login on the left and module preview on the right.
- The large text hero is replaced by compact module tiles.
- No public restaurant card grid appears.
- Restaurant dropdown appears in the login form.
- Changing restaurant reloads the selected workspace before login.
- Owner password/PIN `0000` enters manager mode for the selected restaurant.
- Employee password/PIN `0000` enters My Schedule for the selected restaurant.
- Sliding partner/stack bar appears on desktop without blocking the login.
- Direct workspace routes still require the dev gate first during development.
