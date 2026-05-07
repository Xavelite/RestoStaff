# RestoStaff Code Review v181

## Scope

v181 is an access-screen polish release. It does not change operational module behavior.

## Changes reviewed

- `index.html` now links `assets/css/auth.css` after the main stylesheet.
- The RestoStaff entry screen now uses a module tile board instead of a text-heavy hero.
- The login form now includes a prototype restaurant dropdown.
- The visible login title is neutral (`Enter RestoStaff`) rather than a selected restaurant name.
- The partner/stack area is now a subtle animated marquee.
- `app.js` now populates the login restaurant dropdown and reloads the selected workspace before login.
- Workspace cards remain removed from the visible login flow.

## Safety notes

- The private dev gate remains in front of all non-terminal prototype access.
- Prototype credentials are still intentionally simple for development, but are not shown in the UI.
- Supabase remains the source of truth.
- The one-row JSONB workspace model is unchanged.
- No calendar CSS or planning layout logic was rewritten.
- No Time Clock terminal behavior was changed.

## Next recommended step

Start the controlled fractioning phase only after visual approval of v181:

1. Keep `index.html` as the static shell.
2. Continue extracting access/shell styles first.
3. Then split JS by stable boundaries, beginning with auth/workspace helpers.
4. Move operational modules one by one only after each baseline is visually approved.
