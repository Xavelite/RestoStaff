# Reservations

Reservations is an optional acceptance track, disabled by default through
server-owned restaurant module entitlements. It is not a dependency of the
workforce pilot.

When enabled, the module includes internal bookings, live arrivals and table
state, booking rules, floor-plan/table editing, and a public website booking
channel. Schedule reads only a restaurant-scoped expected-cover aggregate.

## Server boundary

- Every authenticated reservation management RPC requires the `reservations`
  entitlement in PostgreSQL.
- The public Edge Function validates the revocable channel key, exact website
  origin, signed embed session, rate limit, request size, and idempotency key.
  It also checks the same module entitlement before any public action.
- Public browsers never receive direct table grants.
- Availability, holds, exact table assignment, confirmation, and lifecycle
  transitions are transactional and append history.
- Disabling Reservations immediately closes both manager routes and the public
  booking channel without deleting data.

## Current space model

The current floor editor places operational `work_areas` inside physical
`reservation_floors`; `reservation_rooms` links those concepts and owns the
table geometry. Non-reservable operational areas cannot receive tables, and
only active rooms with available tables appear in the public booking context.
Restaurant's operational Areas workspace does not read or write reservation
floors, rooms, or tables. Its revisioned save is independent. The former
combined venue save is service-only and must not be restored to browser
clients.

This is intentionally **not accepted as the final guest-space model**. A
future Reservations release must introduce independent physical spaces and
reservation sections, with optional links to staffing areas. Kitchen,
dishwashing, reception, and other operational zones must never become public
guest choices merely because they exist in Restaurant setup.

Until that migration and its browser acceptance are complete, keep the module
disabled for workforce-only pilots. A restaurant that explicitly pilots
Reservations must review its floor inventory and public labels separately.

## Public booking lifecycle

`/reservations/api` creates or rotates a channel, controls allowed origins, and
provides website embed instructions. `/book` loads only through that channel.
The `reservation-public` Edge Function supports:

1. context and a short-lived embed session;
2. server-calculated availability;
3. a five-minute exact-table hold;
4. idempotent confirmation;
5. explicit release or automatic expiry.

The production website still needs reviewed guest privacy copy, restaurant
contact details, cancellation/help instructions, and real-device/browser
acceptance before public launch.

## Acceptance

When the entitlement is enabled, test internal booking create/edit/status,
capacity and cutoff errors, floor/table constraints, concurrent holds,
idempotent confirmation, expiry/release, origin denial, channel rotation,
localization, and public mobile recovery. Reservations remains disabled if any
of those gates is not recorded.
