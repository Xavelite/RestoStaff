-- Supabase-managed schemas and roles already exist on a new hosted project.
-- These extensions are the only non-default dependencies used by public SQL.

create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists citext with schema public;
create extension if not exists btree_gist with schema public;

-- New hosted projects grant browser roles broad access to future public
-- objects. Restogogo is RPC-only except for the three personal notification
-- tables, so neutralize those defaults before creating the baseline objects.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;
