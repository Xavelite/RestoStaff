# RestoStaff v177 — Reservations / Covers Forecast

Adds a restaurant-oriented Forecast tab for expected covers and service notes.

## Included

- Weekly covers by day and service: Lunch / Evening.
- Private booking toggle per service.
- Event/group note per service.
- General day note for weather, holidays or busy-day context.
- Service pressure helper comparing expected covers to planned staff.
- Event/private-booking summary.
- Forecast CSV export and print report.

## Data model

Stored inside the existing one-row JSON state:

```js
data.forecast = {
  days: {
    "YYYY-MM-DD": {
      date,
      notes,
      Lunch: { covers, event, privateBooking, notes },
      Evening: { covers, event, privateBooking, notes }
    }
  }
}
```

No Supabase schema change, no auth change, no reservations/POS integration yet.
