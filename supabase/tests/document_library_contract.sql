-- Restaurant documents are private, quota-reserved and visible only through
-- the reviewed Owner/Manager read model. Fixture writes are rolled back.
begin;

do $document_schema$
declare
  v_table text;
  v_rpc text;
begin
  foreach v_table in array array[
    'restaurant_document_storage_settings',
    'restaurant_documents',
    'restaurant_document_events'
  ]
  loop
    if not exists (
      select 1
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = v_table
        and relation.relrowsecurity
    ) then
      raise exception 'Document table % is missing RLS.', v_table;
    end if;

    if exists (
      select 1
      from information_schema.role_table_grants grant_row
      where grant_row.table_schema = 'public'
        and grant_row.table_name = v_table
        and grant_row.grantee in ('anon', 'authenticated')
    ) then
      raise exception 'Document table % must remain RPC-only.', v_table;
    end if;
  end loop;

  if not exists (
    select 1
    from storage.buckets bucket
    where bucket.id = 'restaurant-documents'
      and not bucket.public
      and bucket.file_size_limit = 10485760
  ) then
    raise exception 'The private document bucket or 10 MB ceiling is missing.';
  end if;

  if (
    select count(*)
    from pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname in (
        'restaurant documents accept reserved uploads',
        'restaurant documents expose reserved upload result',
        'restaurant documents are privately readable',
        'restaurant documents allow managed removal'
      )
  ) <> 4 then
    raise exception 'The reviewed document Storage policies are incomplete.';
  end if;

  if exists (
    select 1
    from pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and (
        policy.policyname like 'temporary_document_upload_diagnosis_%'
        or policy.policyname = 'restaurant documents complete reserved uploads'
      )
  ) then
    raise exception 'Temporary or unnecessary document Storage policies remain.';
  end if;

  foreach v_rpc in array array[
    'get_restaurant_documents(uuid)',
    'begin_restaurant_document_upload(uuid,text,text,text,bigint,text,uuid,date,date,text,text)',
    'finalize_restaurant_document_upload(uuid,uuid)',
    'cancel_restaurant_document_upload(uuid,uuid)',
    'update_restaurant_document(uuid,uuid,text,text,uuid,date,date,text,text)',
    'archive_restaurant_document(uuid,uuid)',
    'record_restaurant_document_download(uuid,uuid)'
  ]
  loop
    if has_function_privilege('anon', 'public.' || v_rpc, 'EXECUTE') then
      raise exception 'Anonymous role can execute document RPC %.', v_rpc;
    end if;
    if not has_function_privilege('authenticated', 'public.' || v_rpc, 'EXECUTE') then
      raise exception 'Authenticated role cannot execute document RPC %.', v_rpc;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_trigger trigger
    where trigger.tgrelid = 'public.restaurant_document_events'::regclass
      and trigger.tgname = 'restaurant_document_events_immutable'
      and not trigger.tgisinternal
  ) then
    raise exception 'Document activity history is not immutable.';
  end if;
end
$document_schema$;

do $document_workflow$
declare
  v_owner_auth_id uuid := gen_random_uuid();
  v_manager_auth_id uuid := gen_random_uuid();
  v_employee_auth_id uuid := gen_random_uuid();
  v_owner_profile_id uuid;
  v_manager_profile_id uuid;
  v_employee_profile_id uuid;
  v_restaurant_id uuid := gen_random_uuid();
  v_cancelled_id uuid;
  v_active_id uuid := gen_random_uuid();
  v_archived_id uuid := gen_random_uuid();
  v_owner_only_id uuid := gen_random_uuid();
  v_reservation jsonb;
  v_workspace jsonb;
  v_employee_denied boolean := false;
begin
  insert into auth.users (id, email)
  values
    (v_owner_auth_id, 'documents-owner-' || v_owner_auth_id::text || '@example.test'),
    (v_manager_auth_id, 'documents-manager-' || v_manager_auth_id::text || '@example.test'),
    (v_employee_auth_id, 'documents-employee-' || v_employee_auth_id::text || '@example.test');

  insert into public.profiles (auth_user_id, first_name, last_name, email)
  values (
    v_owner_auth_id,
    'Document',
    'Owner',
    'documents-owner-' || v_owner_auth_id::text || '@example.test'
  )
  returning id into v_owner_profile_id;
  insert into public.profiles (auth_user_id, first_name, last_name, email)
  values (
    v_manager_auth_id,
    'Document',
    'Manager',
    'documents-manager-' || v_manager_auth_id::text || '@example.test'
  )
  returning id into v_manager_profile_id;
  insert into public.profiles (auth_user_id, first_name, last_name, email)
  values (
    v_employee_auth_id,
    'Document',
    'Employee',
    'documents-employee-' || v_employee_auth_id::text || '@example.test'
  )
  returning id into v_employee_profile_id;

  insert into public.restaurants (id, workspace_slug, name, owner_profile_id)
  values (
    v_restaurant_id,
    'documents-' || replace(v_restaurant_id::text, '-', ''),
    'Document contract fixture',
    v_owner_profile_id
  );
  insert into public.restaurant_memberships (restaurant_id, profile_id, role, status)
  values
    (v_restaurant_id, v_owner_profile_id, 'owner', 'active'),
    (v_restaurant_id, v_manager_profile_id, 'manager', 'active'),
    (v_restaurant_id, v_employee_profile_id, 'employee', 'active');
  insert into public.services (restaurant_id, service_key, name, sort_order)
  values
    (v_restaurant_id, 'lunch', 'Lunch', 1),
    (v_restaurant_id, 'evening', 'Evening', 2);

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_owner_auth_id, 'role', 'authenticated')::text,
    true
  );

  v_reservation := public.begin_restaurant_document_upload(
    v_restaurant_id,
    'Cancelled reservation',
    'cancelled.pdf',
    'application/pdf',
    1024,
    'legal'
  );
  v_cancelled_id := (v_reservation ->> 'document_id')::uuid;
  perform public.cancel_restaurant_document_upload(v_restaurant_id, v_cancelled_id);

  v_workspace := public.get_restaurant_documents(v_restaurant_id);
  if jsonb_array_length(v_workspace -> 'documents') <> 0 then
    raise exception 'Cancelled reservations must not appear as archived files.';
  end if;

  insert into public.restaurant_documents (
    id,
    restaurant_id,
    title,
    original_filename,
    object_path,
    mime_type,
    size_bytes,
    category,
    access_scope,
    status,
    created_by_profile_id,
    updated_by_profile_id,
    archived_at
  )
  values
    (
      v_active_id,
      v_restaurant_id,
      'Active procedure',
      'procedure.pdf',
      v_restaurant_id::text || '/' || v_active_id::text,
      'application/pdf',
      2048,
      'operations',
      'management',
      'ready',
      v_owner_profile_id,
      v_owner_profile_id,
      null
    ),
    (
      v_archived_id,
      v_restaurant_id,
      'Archived permit',
      'permit.pdf',
      v_restaurant_id::text || '/' || v_archived_id::text,
      'application/pdf',
      4096,
      'compliance',
      'management',
      'archived',
      v_owner_profile_id,
      v_owner_profile_id,
      now()
    ),
    (
      v_owner_only_id,
      v_restaurant_id,
      'Owner agreement',
      'agreement.pdf',
      v_restaurant_id::text || '/' || v_owner_only_id::text,
      'application/pdf',
      1024,
      'legal',
      'owner',
      'ready',
      v_owner_profile_id,
      v_owner_profile_id,
      null
    );

  insert into public.restaurant_document_events (
    restaurant_id,
    document_id,
    event_type,
    actor_profile_id
  )
  values
    (v_restaurant_id, v_active_id, 'uploaded', v_owner_profile_id),
    (v_restaurant_id, v_archived_id, 'uploaded', v_owner_profile_id),
    (v_restaurant_id, v_archived_id, 'archived', v_owner_profile_id),
    (v_restaurant_id, v_owner_only_id, 'uploaded', v_owner_profile_id);

  v_workspace := public.get_restaurant_documents(v_restaurant_id);
  if jsonb_array_length(v_workspace -> 'documents') <> 3 then
    raise exception 'Owners must see active, deliberately archived, and owner-only documents.';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_manager_auth_id, 'role', 'authenticated')::text,
    true
  );
  v_workspace := public.get_restaurant_documents(v_restaurant_id);
  if jsonb_array_length(v_workspace -> 'documents') <> 2 then
    raise exception 'Managers must not see owner-only documents.';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_employee_auth_id, 'role', 'authenticated')::text,
    true
  );
  begin
    perform public.get_restaurant_documents(v_restaurant_id);
  exception
    when others then
      v_employee_denied := true;
  end;
  if not v_employee_denied then
    raise exception 'Employees must not open the management document library.';
  end if;
end
$document_workflow$;

rollback;
