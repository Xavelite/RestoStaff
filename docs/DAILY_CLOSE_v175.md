# RestoStaff v175 — Daily Close / Payments

Daily Close is an operational restaurant closing module. It is not an accounting engine and does not replace legal bookkeeping.

## Data stored in JSON

`data.dailyClose` contains:

- `closings` keyed by date
- payment totals by method
- opening cash float
- actual cash counted
- cash movements
- tips total
- manager notes
- draft/closed status

## Payment methods

- Cash
- Bancontact
- Visa / Mastercard
- Amex
- Meal vouchers
- Gift cards
- Delivery platforms
- Bank transfer / invoice
- Other

## Cash calculation

Expected cash = opening float + cash payments + signed cash movements.

Difference = actual counted cash - expected cash.

## Cash movements

Supported movements include cash in, cash out, safe/bank deposit, cash expense, tips removed, and correction.

## Scope

This is intended for daily operational control, owner review, and export/print reporting. Legal accounting exports and POS/payment integrations can be added later.
