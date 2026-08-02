-- Keep a manager's worked-time correction and its payroll evidence atomic.
begin;

do $patch_actuals_payroll_evidence$
declare
  v_definition text;
  v_with_evidence text;
  v_with_ack text;
begin
  select replace(
    pg_get_functiondef('public.save_actuals_lifecycle(uuid,text,jsonb)'::regprocedure),
    chr(13),
    ''
  )
  into v_definition;

  v_with_evidence := replace(
    v_definition,
    $old$      end if;
    end if;
  else
    v_week_start := nullif(p_payload->>'week_start', '')::date;$old$,
    $new$      end if;

      -- New clients submit actual assignment and exact breaks with the time
      -- entry. Run the existing evidence authority in this transaction so a
      -- failure rolls the complete manager action back.
      if v_clock_out is not null and (
        p_payload ? 'actual_job_function_id'
        or p_payload ? 'actual_area_id'
        or p_payload ? 'break_intervals'
      ) then
        perform public.save_time_entry_payroll_evidence(
          p_restaurant_id,
          v_after.id,
          nullif(p_payload->>'actual_job_function_id', '')::uuid,
          nullif(p_payload->>'actual_area_id', '')::uuid,
          p_payload->'break_intervals',
          v_reason
        );
        select * into v_after
        from public.time_entries t
        where t.restaurant_id = p_restaurant_id and t.id = v_after.id;
      end if;
    end if;
  else
    v_week_start := nullif(p_payload->>'week_start', '')::date;$new$
  );
  if v_with_evidence = v_definition then
    raise exception 'save_actuals_lifecycle evidence anchor drifted.';
  end if;

  v_with_ack := replace(
    v_with_evidence,
    $old$  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id
  );$old$,
    $new$  return jsonb_build_object(
    'ok', true,
    'restaurant_id', p_restaurant_id,
    'entity_id', case
      when v_action in ('manual_entry', 'adjust_entry', 'cancel_entry')
        then coalesce(v_after.id, v_entry.id)
      else null
    end
  );$new$
  );
  if v_with_ack = v_with_evidence then
    raise exception 'save_actuals_lifecycle acknowledgement anchor drifted.';
  end if;

  execute v_with_ack;
end
$patch_actuals_payroll_evidence$;

commit;
