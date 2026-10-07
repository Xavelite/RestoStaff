# Universal

Universal is published at `/universal/`, linked from the xbesnard.com homepage.
`public-projects/universal/public/` is an independent release of its browser-local
mockup. It contains shipped examples only, including Excel, PowerPoint, Word,
audio and images. Visitor data, uploads and computer app registrations are never
part of the release. Tools & settings → Create a demo space makes a fresh guest
profile in the current browser. There is no account service or cross-PC sync.

The existing post-build script stages Universal independently of Restogogo's
service worker and stages a small Node function at `/universal/api/widgets` for
the allowlisted news/currency/Bitcoin sources. The companion is an optional
Windows ZIP download, connects to loopback, and requires explicit local pairing.
Its allowed web origins are xbesnard.com, www.xbesnard.com, and the two localhost
development origins. Local app links are tied to a particular computer.

To update: finish work in the Universal Website source, rebuild its companion ZIP
if changed, then run `node scripts/export-public.mjs <this repository>/public-projects/universal`
from Universal. The exporter scopes paths under `/universal/` and copies an
explicit public-file allowlist. Commit the generated release and publish using
this repository's existing Vercel Git integration. Do not publish desktop browser
storage or the whole development workspace.

Initial release: 0.18.0, 7 October 2026. Existing Restogogo and IdleAge releases
remain unchanged.
