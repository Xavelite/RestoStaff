# Responsive contract

## Width ladder (`max-width`)

The application uses one `max-width` breakpoint ladder:

- `1180px`: wide dashboard density changes, such as four metrics becoming two.
- `980px`: compact workbench and multi-panel layouts.
- `760px`: mobile navigation and compact workspace controls.
- `520px`: narrow-phone refinements only.

`tests/ui-contracts.test.mjs` rejects any `@media (max-width: ...)` outside this
ladder.

## Desktop scroll contract

Desktop pages use normal document scrolling. The app no longer tries to force every workspace into one viewport.

Purposeful local overflow is still allowed where the content itself is a dense surface:

- weekly boards may scroll horizontally to preserve readable employee rows and configured service slots;
- month boards may scroll inside their own calendar area when the viewport is constrained;
- dialogs, notification feeds and export previews may scroll internally because they are bounded overlays.

Avoid tiny nested scroll panes for ordinary page content. If a section reads like a page, let the page scroll.

## Rules

- Shared components own responsive behaviour used by more than one module.
- Configured weekly service slots remain side by side on desktop and tablet.
- Mobile preserves Schedule and Time & attendance as bounded weekly boards with
  a sticky employee column. My service and My time use employee-focused cards.
- Module pages compose the shared scaffold; they must not introduce arbitrary
  widths, per-page scroll handling, or a hidden header fallback.
