# IdleAge publication

The xbesnard.com homepage links to Restogogo at `/restogogo/` and IdleAge at
`/IdleAge/`. The earlier `/game` placeholder and lowercase `/idleage` redirect
to IdleAge. The public `/pasta` film and Restogogo routes remain available.

`public-projects/idleage/` contains a compiled, independently published snapshot
of Incremental Game 2.0. It does not contain a live link to the development
folder. Gameplay saves remain in the visitor's browser.

After the usual website build, `scripts/stage-public-projects.mjs` copies the
release into `/IdleAge/` in the Vercel static output (or local `build/` output).
Keeping it outside SvelteKit's `static/` directory prevents Restogogo's service
worker from downloading and caching the game when someone opens Restogogo.

For a later release, first copy the current game source into a new independent
release folder. Build that copy for the `/IdleAge/` base path, including the
explicit runtime artwork URLs, and apply the IdleAge display name there.
Replace `public-projects/idleage/` with the verified output and publish through
the website's Git deployment. Never build or edit in the active game folder as
part of publication. Do not automatically publish ongoing development changes.

Initial release: 2026-09-08. The complete initial source snapshot and its SHA-256
inventory are retained locally in `C:/dev/deployments/idleage-20260908/`.

Current release: `20260910-eras`. Garden, Tide, Amber and Titan ecosystems,
32 animal species, updated structures, creation/Tide storytelling and the new
Amber/Titan voiced transitions. Runtime image and audio URLs are scoped under
`/IdleAge/`, including template-literal asset paths. Restogogo and hosting routes
are unchanged. Source inventory and previous game output are retained locally
in `C:/dev/deployments/idleage-20260910-eras/`; `release.json` identifies the exact
snapshot. Prior production commit: `2047c4d`.
