# Architecture notes

## Current state

This is still a vanilla HTML/CSS/JS app. The UI is intentionally preserved from the final local prototype.

The current version introduces the first proper storage boundary:

```txt
assets/js/data-adapter.local.js
```

The main app now calls:

```txt
window.DataAdapter.readPlanner()
window.DataAdapter.savePlanner(data)
window.DataAdapter.readSession(...)
window.DataAdapter.saveSession(session)
window.DataAdapter.isLoggedIn()
window.DataAdapter.setLoggedIn(...)
window.DataAdapter.readNotificationsRead()
window.DataAdapter.saveNotificationsRead(...)
window.DataAdapter.readPreference(...)
window.DataAdapter.savePreference(...)
```

The online implementation uses Supabase for the shared planner data; small prototype session/preferences remain browser-local.

## Why this matters

The next backend pass can add:

```txt
assets/js/data-adapter.supabase.js
```

with the same public methods. The app can then swap from local-only storage to shared online storage with minimal UI changes.

## Current storage path

```txt
app.js
  ↓
DataAdapter
  ↓
LocalDataAdapter
  ↓
localStorage
```

## Next storage path

```txt
app.js
  ↓
DataAdapter
  ↓
SupabaseDataAdapter
  ↓
Supabase
```

## Important terminology

This is a planning tool, not a payroll tool. Prefer:

- planned hours
- planned cost
- planning rate
- staff cost estimate

Avoid:

- payroll
- worked hours
- actual cost
