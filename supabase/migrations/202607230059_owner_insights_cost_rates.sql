-- V579: owner-only temporary cost-rate source for the existing Insights page.
begin;

create function public.get_insights_cost_rates(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can view labour-cost rates.';
  end if;
  return jsonb_build_object(
    'source', 'estimated_profile_rate',
    'rates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_id', e.id,
        'estimated_hourly_cost_cents',
          case when coalesce(p.estimated_hourly_cost, 0) > 0
            then round(p.estimated_hourly_cost * 100)::bigint else null end,
        'has_rate', coalesce(p.estimated_hourly_cost, 0) > 0,
        'employment_type', coalesce(et.employment_type_code, ct.code, 'NOT_SET')
      ) order by e.sort_order, e.display_name)
      from public.employees e
      left join public.employee_payroll_profiles p
        on p.restaurant_id = e.restaurant_id and p.employee_id = e.id
      left join lateral (
        select x.employment_type_code
        from public.employee_employment_terms x
        where x.restaurant_id = e.restaurant_id and x.employee_id = e.id and x.active
        order by x.valid_from desc, x.version_number desc limit 1
      ) et on true
      left join lateral (
        select c.contract_type_id
        from public.employee_contracts c
        where c.restaurant_id = e.restaurant_id and c.employee_id = e.id
          and c.active and c.is_current
        order by c.contract_start desc nulls last, c.created_at desc limit 1
      ) contract on true
      left join public.contract_types ct
        on ct.restaurant_id = e.restaurant_id and ct.id = contract.contract_type_id
      where e.restaurant_id = p_restaurant_id and e.active
    ), '[]'::jsonb),
    'missing_active_employee_count', (
      select count(*)
      from public.employees e
      left join public.employee_payroll_profiles p
        on p.restaurant_id = e.restaurant_id and p.employee_id = e.id
      where e.restaurant_id = p_restaurant_id and e.active
        and coalesce(p.estimated_hourly_cost, 0) <= 0
    )
  );
end
$$;

revoke all on function public.get_insights_cost_rates(uuid) from public, anon, authenticated;
grant execute on function public.get_insights_cost_rates(uuid) to authenticated;

comment on function public.get_insights_cost_rates(uuid) is
  'Owner-only estimated employer-cost rates. Managers receive no cost values; no wage fallback is used.';

commit;
