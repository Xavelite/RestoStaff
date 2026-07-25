-- V583: tighten Belgian identifiers and keep older clients from clearing new employer settings.

alter table public.restaurants
  drop constraint if exists restaurants_company_number_format,
  add constraint restaurants_company_number_format
    check (
      company_number is null
      or regexp_replace(company_number, '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
    );

alter table public.employee_legal_profiles
  drop constraint if exists employee_legal_profiles_niss_length,
  add constraint employee_legal_profiles_niss_length
    check (
      national_registry_number is null
      or regexp_replace(national_registry_number, '[^0-9]', '', 'g') ~ '^[0-9]{11}$'
    );
