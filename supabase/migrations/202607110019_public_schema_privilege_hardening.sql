-- Runtime roles may resolve explicitly granted public objects, but they must
-- never create or replace objects in the application schema.
revoke all on schema public from public;
revoke create on schema public from anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
