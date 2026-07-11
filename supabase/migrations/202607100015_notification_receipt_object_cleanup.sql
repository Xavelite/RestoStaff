-- Finish the notification_feed_states to notification_receipts consolidation.
-- Canonical indexes and trigger already exist, so the old copies are redundant.

begin;

drop trigger if exists set_notification_feed_states_updated_at
  on public.notification_receipts;

drop index if exists public.notification_feed_states_profile_restaurant_idx;
drop index if exists public.notification_feed_states_restaurant_type_idx;
drop index if exists public.notification_feed_states_unread_idx;

alter table public.notification_receipts
  rename constraint notification_feed_states_key_format
  to notification_receipts_key_format;
alter table public.notification_receipts
  rename constraint notification_feed_states_pkey
  to notification_receipts_pkey;
alter table public.notification_receipts
  rename constraint notification_feed_states_unique
  to notification_receipts_unique;
alter table public.notification_receipts
  rename constraint notification_feed_states_membership_fk
  to notification_receipts_membership_fk;
alter table public.notification_receipts
  rename constraint notification_feed_states_notification_type_fkey
  to notification_receipts_notification_type_fkey;

commit;
