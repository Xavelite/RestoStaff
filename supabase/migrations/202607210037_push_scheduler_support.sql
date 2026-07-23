-- Web Push dispatch uses Supabase Cron, pg_net, and Vault. Environment-specific
-- URLs and credentials are configured after bootstrap and never stored here.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

