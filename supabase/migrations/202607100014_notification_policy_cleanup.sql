-- Remove pre-canonical receipt-policy aliases and finish current catalog and
-- schema-comment terminology. Canonical notification_receipts_* policies stay.

begin;

drop policy if exists "notification_feed_states_select_own" on public.notification_receipts;
drop policy if exists "notification_feed_states_insert_own" on public.notification_receipts;
drop policy if exists "notification_feed_states_update_own" on public.notification_receipts;

update public.notification_types
set
  description = case code
    when 'employee_badged_late' then 'An employee badged in later than the scheduled shift start.'
    when 'employee_no_show' then 'A scheduled employee has no matching worked time.'
    else description
  end,
  updated_at = now()
where code in ('employee_badged_late', 'employee_no_show');

comment on function public.crypt(text, text) is
  'Public wrapper for extensions.crypt() - required because RPCs use SET search_path = public.';

commit;
