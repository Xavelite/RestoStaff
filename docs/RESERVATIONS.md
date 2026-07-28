# Reservations

Reservations is a native restaurant workspace, not a separate booking
prototype. It shares the restaurant tenant, services, opening hours and work
areas already used by Restaurant and Schedule.

## Domain boundaries

- `services` and `opening_hours` remain the source of truth for when the
  restaurant operates.
- `work_areas` remain the source of truth for operational areas. A
  `reservation_room` opts one of those areas into reservations and places it
  on a physical `reservation_floor`.
- A floor owns a resizable logical canvas. Area bounds and table coordinates
  are stored on that canvas, allowing one physical level to contain several
  operational areas without duplicating Restaurant data.
- Reservation tables and combinations belong to one reservable area.
- Guests are restaurant-scoped. Matching uses normalized email or phone while
  keeping consent and anonymization fields available for later CRM work.
- Reservations keep their current state for efficient reads and append an
  immutable event for every create, edit and status transition.
- Table assignments are historical. Reassignment closes the current assignment
  instead of deleting it.

## Authoritative availability

`reservation_availability_internal` is the single availability path used by
the internal editor and exposed through the guarded
`check_reservation_availability` RPC for future widgets and integrations. It
enforces service configuration, opening exceptions, booking intervals, party
limits, duration and turn time, advance/cutoff rules, cover capacity, room
preference, blocked tables, overlap, and configured table combinations.

`save_reservation` takes a restaurant-scoped advisory transaction lock, checks
availability again, matches or creates the guest, chooses the smallest suitable
table, stores the assignment explanation, and appends an event. Frontend checks
are feedback only and never replace this transaction.

## Product surfaces

- `/reservations` is the live floor plan and arrivals workspace.
- `/reservations/bookings` is the searchable booking grid and editor.
- `/reservations/floor-plans` creates physical floors, places Restaurant areas
  and edits real table objects.
- `/reservations/setup` configures service rules and chooses which Restaurant
  areas accept reservations.
- Schedule reads `get_reservation_demand` for daily expected-cover context. It
  does not read reservation tables directly.

## Deliberately later

Manual drag assignment, waiting-list conversion, public booking widget, guest
CRM screens, experiences, deposits, notifications, decorative floor objects
and Zenchef synchronization remain later slices. The current schema keeps
stable extension points for those features without presenting non-working UI.
