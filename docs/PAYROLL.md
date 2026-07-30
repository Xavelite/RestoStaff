# Payroll preparation

Restogogo prepares trustworthy inputs for a Belgian social secretariat. It
does not calculate official gross-to-net payroll, submit Dimona or DmfA,
settle taxes or social security, or issue payslips.

## Pilot workflow

1. The Owner records current employment facts, payroll identifier, national
   registry number, bank account, CP 302 reference function, salary basis, and
   optional provider mapping.
2. Managers maintain operational identity, positions, scheduling regime,
   contract dates and worked-time evidence. They cannot read bank, salary,
   national-registry, estimated-cost, tax, or provider-private fields.
3. Time & attendance reconciles badge evidence, exact breaks, actual area and
   position, corrections, and weekly approval.
4. Exports creates a clearly labelled draft social-secretariat file from the
   selected period. Approved/frozen source status and row lineage remain
   visible; the provider remains authoritative.

Use **Payroll preparation** in product copy. A readiness warning means the
file may be incomplete; it is not a payroll calculation result.

## Authority and data handling

- PostgreSQL RPCs own validation, tenant scope, revision checks, and access.
- Sensitive payroll and legal identity data is Owner-only.
- Manager Team saves preserve hidden Owner values rather than replacing them
  with blank browser state.
- Employment terms are effective-dated. A correction creates or validates a
  reviewed version rather than silently rewriting history.
- Money values use PostgreSQL `numeric` or integer euro cents. JavaScript
  floating point is never authoritative.
- Export projections are read-only until a separately approved immutable
  export workflow is introduced.

## Experimental engine quarantine

The repository still contains advanced CP 302 calculation, benefit,
provider-export, return-import, reconciliation, and run-finalization tables and
functions from development experiments. They are not active pilot product
surfaces.

Migration `20260729233500_quarantine_experimental_modules.sql` revokes
authenticated access to those engine RPCs. Service-role/database operators may
retain them for controlled research and data migration, but they must not be
enabled for a restaurant without:

- written scope from the pilot social secretariat;
- official effective legal sources;
- provider file and return specifications;
- representative golden cases reviewed by a payroll professional;
- privacy, retention, reconciliation, and failure ownership;
- a separate product and security acceptance track.

The active application retains only employment terms, payroll-preparation
catalogue/reference data, Timesheet evidence, export preview/history, and
provider-neutral handoff facts.

## Validation

- `tests/payroll-engine.test.mjs` protects decimal parsing and deterministic
  display helpers still used by preparation surfaces.
- Team model tests protect Owner-only values and Manager preservation.
- Linked SQL tests validate employment-term derivation, payroll evidence,
  grants, RLS, and export lineage.
- A production pilot still requires the social secretariat to approve the
  final exported columns and sample files.
