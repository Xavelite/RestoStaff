# Bouillon Bruxelles Staff Planner

Clean local build with a **local data adapter** (`v110-data-adapter-local`).

The UI and prototype login behavior are unchanged. The important internal change is that the app no longer talks directly to `localStorage` from the main app logic.

## Run locally

Open `index.html` directly in a browser, or serve the folder with a simple static server:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Prototype access

This version intentionally keeps the temporary prototype access flow:

- choose Owner or Employee
- employee dropdown for employee mode
- no password yet

Real authentication should be added later with Supabase.

## Structure

```txt
index.html                         Main app shell
logo.png                           Brand asset
assets/css/app.css                 Current production stylesheet
assets/js/data-adapter.local.js    Local storage adapter
assets/js/app.js                   App UI + planning logic
docs/ARCHITECTURE.md               Notes for Supabase migration
```

## Current storage mode

The app still stores data in the browser, but only through the adapter:

```txt
app.js → DataAdapter → localStorage
```

Main local keys:

```txt
bb_v14             planner data
bb_session         selected role/user
bb_logged          local prototype access flag
bb_notif_read      read notification state
bb_show_zero_rows  UI preference
bb_show_metrics    UI preference
```

## Next step

Create a Supabase adapter with the same method names as `assets/js/data-adapter.local.js`.

Target next shape:

```txt
LocalDataAdapter
SupabaseDataAdapter
```

Then the app can switch storage without changing the UI.

## Supabase mode

This build includes a Supabase data adapter.

Configuration lives in:

```txt
assets/js/config.js
```

Current mode:

```js
storageMode: "supabase"
```

The shared planner data is saved in:

```txt
public.planner_state
id = main
```

Session state, the prototype Owner/Employee chooser, and small UI preferences remain browser-local for now. The actual planner JSON is shared through Supabase.

### Quick test

1. Open `index.html` in a normal browser window.
2. Login as Owner.
3. Add a shift or change a zone.
4. Open the same `index.html` in another normal browser/profile.
5. Login as Owner or Employee.
6. The planner data should load from Supabase.

Incognito/private windows may clear local session data when closed. That is normal.

If data does not sync, verify `supabaseUrl` and `supabaseKey` in `assets/js/config.js`.
