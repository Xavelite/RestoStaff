# Rebuild design decisions

Living notes for the SvelteKit rebuild. These are deliberate choices, not ports:
the rebuild is the current app minus what we disliked, plus what we wished for.

## Naming

- Team and Restaurant tab **Core → General**. “Core” is jargon.
- General merges identity and contact, so it is a fuller tab.
- Employee modules:
  - **Shifts**: published shifts plus weekly availability.
  - **Calendar**: monthly worked time, availability and leave.

## Board contract (corrected — see CONTRACTS.md §5)

- **Planning and Actuals** share one board component, `OperationsBoard`
  (`src/lib/components/OperationsBoard.svelte`): employees as rows, Mon–Sun
  columns, lunch/evening service slots — the operational week at a glance.
  Each page maps its own domain data (planned shifts / time entries) onto a
  small set of plain `BoardRow`/`BoardSlot`/`BoardServiceCard` shapes; the
  component owns the grid geometry, today-highlight and tone language so the
  two boards cannot visually drift apart again. (The older `WeeklyGrid`
  component this note used to reference was dead code — nothing imported it —
  and has been removed.)
- Both pages also support an optional **month-wide review lens** (toggle only
  reachable in focus mode): it widens what the board *displays*, not what it
  *edits*. Publish/approve and the payroll lifecycle always stay scoped to one
  Monday-start week regardless of the browsing lens — Planning keeps its
  mutable draft anchored to that single active week (neighbouring weeks shown
  in month mode render read-only, from committed data); Actuals has no draft
  concept so this distinction doesn't arise there.
- Save/approve stays week-owned (one Monday-start week; DB lifecycle + optimistic lock).
- **Shifts** (employee) is the focused employee weekly view (same week rhythm).
- **Calendar** (employee) is the month-grid view for an employee's own worked
  time / availability / leave. It is a separate system (`EmployeeWeekBoard` /
  `MonthBoard` / `ServiceSlotSurface`) from the manager `OperationsBoard` —
  the two are not visually or structurally shared.

## Team and Restaurant information architecture

Target: each tab fits one desktop screen with little or no scrolling.

1. Use columns: fields side-by-side, not one full-width field per row.
2. Merge light tabs: General owns identity and contact.
3. Regroup heavy tabs: Contract and Payroll use tight column groups.
4. Use fewer section boxes; group related fields and drop half-empty panels.
5. Never reproduce the old overlap/cut-off bug where only section headers showed.

## Global

- Keep the dark navy and blue visual language while structure and parity land.
- Preserve business rules, but rebuild their implementation with typed,
  single-source mappings and no dead fallbacks.
