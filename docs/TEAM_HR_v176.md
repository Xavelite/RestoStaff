# RestoStaff v176 — Team / HR module

Adds a practical owner-only Team / HR area while keeping the current one-row Supabase JSON model.

## Includes
- Employee profile details: phone, email, address, contract type, payroll ID, start date, emergency contact, HR notes.
- Prototype document upload stored on the employee object as base64 metadata.
- Absence records: vacation, sick leave, no-show, late, unavailable, other.
- Absence status workflow: pending, approved, rejected.
- Team profile CSV export.
- Absence CSV and print report.

## Data model
Employee profile fields live directly on `data.employees[]`. Absences live in `data.hr.absences[]`. Documents are stored in `employee.documents[]` for prototype only. Later, documents should move to Supabase Storage and only metadata/paths should remain in JSON.

## Not included yet
- Real HR/legal compliance engine.
- Contract signing.
- Supabase Storage upload.
- Belgian payroll/legal validation.
