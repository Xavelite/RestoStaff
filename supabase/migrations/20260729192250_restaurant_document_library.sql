-- Private restaurant document library.
--
-- Documents are deliberately separate from employee contracts and payroll
-- facts: the database stores searchable metadata and an immutable activity
-- trail, while the file bytes stay in a private Storage bucket.
--
-- Uploads use a reservation/finalization contract. The reservation locks and
-- charges the restaurant quota before Storage accepts the object; finalization
-- verifies the stored size and MIME type before the file becomes readable.
-- This prevents a browser from bypassing either the per-file or total limit.
--
-- Rollback:
-- - remove restaurant-document objects, policies and bucket;
-- - revoke/drop the document RPCs and helper;
-- - drop event, document and storage-setting tables in that order.

begin;

create table public.restaurant_document_storage_settings (
  restaurant_id uuid primary key
    references public.restaurants(id) on delete cascade,
  plan_code text not null default 'included'
    check (plan_code in ('included', 'paid', 'custom')),
  total_limit_bytes bigint not null default 262144000
    check (total_limit_bytes between 10485760 and 1099511627776),
  max_file_bytes bigint not null default 10485760
    check (max_file_bytes between 1048576 and 10485760),
  updated_by_profile_id uuid
    references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.restaurant_documents (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 160),
  original_filename text not null
    check (length(btrim(original_filename)) between 1 and 255),
  object_path text not null,
  mime_type text not null check (length(btrim(mime_type)) between 1 and 160),
  size_bytes bigint not null check (size_bytes > 0),
  category text not null check (
    category in (
      'employee',
      'compliance',
      'legal',
      'insurance',
      'finance',
      'supplier',
      'operations',
      'other'
    )
  ),
  employee_id uuid,
  document_date date,
  expires_on date,
  access_scope text not null default 'management'
    check (access_scope in ('management', 'owner')),
  note text check (note is null or length(note) <= 2000),
  status text not null default 'uploading'
    check (status in ('uploading', 'ready', 'archived')),
  created_by_profile_id uuid,
  updated_by_profile_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, id),
  unique (object_path),
  foreign key (restaurant_id) references public.restaurants(id) on delete cascade,
  foreign key (restaurant_id, employee_id)
    references public.employees(restaurant_id, id) on delete set null (employee_id),
  foreign key (created_by_profile_id)
    references public.profiles(id) on delete set null,
  foreign key (updated_by_profile_id)
    references public.profiles(id) on delete set null,
  check (expires_on is null or document_date is null or expires_on >= document_date),
  check (
    (status = 'archived' and archived_at is not null)
    or (status <> 'archived' and archived_at is null)
  )
);

create table public.restaurant_document_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  document_id uuid not null,
  event_type text not null check (
    event_type in (
      'upload_reserved',
      'uploaded',
      'upload_cancelled',
      'metadata_updated',
      'downloaded',
      'archived'
    )
  ),
  actor_profile_id uuid,
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb,
  foreign key (restaurant_id) references public.restaurants(id) on delete cascade,
  foreign key (restaurant_id, document_id)
    references public.restaurant_documents(restaurant_id, id) on delete cascade,
  foreign key (actor_profile_id)
    references public.profiles(id) on delete set null
);

create index restaurant_documents_library_idx
  on public.restaurant_documents (restaurant_id, status, category, created_at desc);
create index restaurant_documents_employee_idx
  on public.restaurant_documents (restaurant_id, employee_id, status)
  where employee_id is not null;
create index restaurant_documents_expiry_idx
  on public.restaurant_documents (restaurant_id, expires_on)
  where status = 'ready' and expires_on is not null;
create index restaurant_document_events_history_idx
  on public.restaurant_document_events (restaurant_id, document_id, occurred_at desc);

create trigger restaurant_document_storage_settings_set_updated_at
  before update on public.restaurant_document_storage_settings
  for each row execute function public.set_updated_at();
create trigger restaurant_documents_set_updated_at
  before update on public.restaurant_documents
  for each row execute function public.set_updated_at();

create function public.guard_restaurant_document_event_history()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Document activity history is immutable.';
end
$$;

create trigger restaurant_document_events_immutable
  before update or delete on public.restaurant_document_events
  for each row execute function public.guard_restaurant_document_event_history();

insert into public.restaurant_document_storage_settings (restaurant_id)
select id
from public.restaurants
on conflict (restaurant_id) do nothing;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'restaurant-documents',
  'restaurant-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function public.document_storage_object_access(
  p_object_path text,
  p_operation text,
  p_size_bytes bigint default null,
  p_mime_type text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  v_document public.restaurant_documents%rowtype;
  v_auth_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_role text;
begin
  if p_operation not in ('read', 'upload', 'delete')
      or v_auth_user_id is null then
    return false;
  end if;

  select *
  into v_document
  from public.restaurant_documents document
  where document.object_path = p_object_path
  limit 1;

  if not found then
    return false;
  end if;

  select membership.profile_id, membership.role::text
  into v_profile_id, v_role
  from public.restaurant_memberships membership
  join public.profiles profile
    on profile.id = membership.profile_id
   and profile.auth_user_id = v_auth_user_id
  join public.restaurants restaurant
    on restaurant.id = membership.restaurant_id
   and restaurant.active
  where membership.restaurant_id = v_document.restaurant_id
    and membership.status = 'active'
    and membership.role in ('owner', 'manager')
  limit 1;

  if not found
      or (v_document.access_scope = 'owner' and v_role <> 'owner') then
    return false;
  end if;

  if p_operation = 'read' then
    return v_document.status = 'ready'
      or (
        v_document.status = 'uploading'
        and v_document.created_by_profile_id = v_profile_id
      );
  end if;

  if p_operation = 'delete' then
    return v_document.status in ('uploading', 'ready', 'archived');
  end if;

  return v_document.status = 'uploading'
    and v_document.created_by_profile_id = v_profile_id
    and (p_size_bytes is null or p_size_bytes = v_document.size_bytes)
    and (
      nullif(lower(split_part(coalesce(p_mime_type, ''), ';', 1)), '') is null
      or lower(split_part(p_mime_type, ';', 1)) = v_document.mime_type
    );
end
$$;

drop policy if exists "restaurant documents are privately readable" on storage.objects;
create policy "restaurant documents are privately readable"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'restaurant-documents'
    and public.document_storage_object_access(name, 'read')
  );

drop policy if exists "restaurant documents accept reserved uploads" on storage.objects;
create policy "restaurant documents accept reserved uploads"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'restaurant-documents'
    and public.document_storage_object_access(name, 'upload')
  );

drop policy if exists "restaurant documents expose reserved upload result" on storage.objects;
create policy "restaurant documents expose reserved upload result"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'restaurant-documents'
    and public.document_storage_object_access(name, 'upload')
  );

drop policy if exists "restaurant documents allow managed removal" on storage.objects;
create policy "restaurant documents allow managed removal"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'restaurant-documents'
    and public.document_storage_object_access(name, 'delete')
  );

create function public.get_restaurant_documents(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner boolean;
  v_documents jsonb;
  v_events jsonb;
  v_employees jsonb;
  v_settings public.restaurant_document_storage_settings%rowtype;
  v_used_bytes bigint;
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);
  v_owner := public.is_owner(p_restaurant_id);

  select *
  into v_settings
  from public.restaurant_document_storage_settings setting
  where setting.restaurant_id = p_restaurant_id;

  select coalesce(sum(document.size_bytes), 0)::bigint
  into v_used_bytes
  from public.restaurant_documents document
  where document.restaurant_id = p_restaurant_id
    and document.status in ('uploading', 'ready');

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', document.id,
        'restaurant_id', document.restaurant_id,
        'title', document.title,
        'original_filename', document.original_filename,
        'object_path', document.object_path,
        'mime_type', document.mime_type,
        'size_bytes', document.size_bytes,
        'category', document.category,
        'employee_id', document.employee_id,
        'employee_name', employee.display_name,
        'document_date', document.document_date,
        'expires_on', document.expires_on,
        'access_scope', document.access_scope,
        'note', document.note,
        'status', document.status,
        'created_by_profile_id', document.created_by_profile_id,
        'uploader_name', coalesce(
          nullif(btrim(concat_ws(' ', uploader.first_name, uploader.last_name)), ''),
          uploader.email
        ),
        'created_at', document.created_at,
        'updated_at', document.updated_at,
        'archived_at', document.archived_at
      )
      order by
        case when document.status = 'ready' then 0 else 1 end,
        document.created_at desc,
        document.id
    ),
    '[]'::jsonb
  )
  into v_documents
  from public.restaurant_documents document
  left join public.employees employee
    on employee.restaurant_id = document.restaurant_id
   and employee.id = document.employee_id
  left join public.profiles uploader
    on uploader.id = document.created_by_profile_id
  where document.restaurant_id = p_restaurant_id
    and (
      document.status = 'ready'
      or (
        document.status = 'archived'
        and exists (
          select 1
          from public.restaurant_document_events archived_event
          where archived_event.restaurant_id = document.restaurant_id
            and archived_event.document_id = document.id
            and archived_event.event_type = 'archived'
        )
      )
    )
    and (document.access_scope = 'management' or v_owner);

  select coalesce(
    jsonb_agg(event_row.payload order by event_row.occurred_at desc, event_row.id),
    '[]'::jsonb
  )
  into v_events
  from (
    select
      event.id,
      event.occurred_at,
      jsonb_build_object(
        'id', event.id,
        'document_id', event.document_id,
        'event_type', event.event_type,
        'actor_profile_id', event.actor_profile_id,
        'actor_name', coalesce(
          nullif(btrim(concat_ws(' ', actor.first_name, actor.last_name)), ''),
          actor.email
        ),
        'occurred_at', event.occurred_at,
        'details', event.details
      ) as payload
    from public.restaurant_document_events event
    join public.restaurant_documents document
      on document.restaurant_id = event.restaurant_id
     and document.id = event.document_id
    left join public.profiles actor
      on actor.id = event.actor_profile_id
    where event.restaurant_id = p_restaurant_id
      and (
        document.status = 'ready'
        or exists (
          select 1
          from public.restaurant_document_events archived_event
          where archived_event.restaurant_id = document.restaurant_id
            and archived_event.document_id = document.id
            and archived_event.event_type = 'archived'
        )
      )
      and (document.access_scope = 'management' or v_owner)
    order by event.occurred_at desc, event.id
    limit 250
  ) event_row;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', employee.id,
        'name', employee.display_name,
        'active', employee.active
      )
      order by employee.active desc, lower(employee.display_name), employee.id
    ),
    '[]'::jsonb
  )
  into v_employees
  from public.employees employee
  where employee.restaurant_id = p_restaurant_id;

  return jsonb_build_object(
    'documents', v_documents,
    'events', v_events,
    'employees', v_employees,
    'quota', jsonb_build_object(
      'plan_code', coalesce(v_settings.plan_code, 'included'),
      'total_limit_bytes', coalesce(v_settings.total_limit_bytes, 262144000),
      'max_file_bytes', coalesce(v_settings.max_file_bytes, 10485760),
      'used_bytes', v_used_bytes
    )
  );
end
$$;

create function public.begin_restaurant_document_upload(
  p_restaurant_id uuid,
  p_title text,
  p_original_filename text,
  p_mime_type text,
  p_size_bytes bigint,
  p_category text,
  p_employee_id uuid default null,
  p_document_date date default null,
  p_expires_on date default null,
  p_access_scope text default 'management',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_profile_id uuid;
  v_document_id uuid := gen_random_uuid();
  v_object_path text;
  v_mime_type text := lower(split_part(btrim(coalesce(p_mime_type, '')), ';', 1));
  v_settings public.restaurant_document_storage_settings%rowtype;
  v_used_bytes bigint;
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);
  v_profile_id := public.current_profile_id();

  if v_profile_id is null then
    raise exception 'A signed-in profile is required to upload documents.';
  end if;
  if length(btrim(coalesce(p_title, ''))) not between 1 and 160 then
    raise exception 'Document title must contain between 1 and 160 characters.';
  end if;
  if length(btrim(coalesce(p_original_filename, ''))) not between 1 and 255
      or p_original_filename ~ E'[/\\\\]'
      or p_original_filename ~ '[[:cntrl:]]' then
    raise exception 'Document filename is invalid.';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 then
    raise exception 'Document file is empty.';
  end if;
  if v_mime_type <> all(array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]) then
    raise exception 'This document file type is not supported.';
  end if;
  if p_category not in (
    'employee',
    'compliance',
    'legal',
    'insurance',
    'finance',
    'supplier',
    'operations',
    'other'
  ) then
    raise exception 'Document category is invalid.';
  end if;
  if p_access_scope not in ('management', 'owner') then
    raise exception 'Document access scope is invalid.';
  end if;
  if p_access_scope = 'owner' and not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can create owner-only documents.';
  end if;
  if p_note is not null and length(p_note) > 2000 then
    raise exception 'Document note cannot exceed 2000 characters.';
  end if;
  if p_document_date is not null
      and p_expires_on is not null
      and p_expires_on < p_document_date then
    raise exception 'Expiry date cannot be before the document date.';
  end if;
  if p_employee_id is not null and not exists (
    select 1
    from public.employees employee
    where employee.restaurant_id = p_restaurant_id
      and employee.id = p_employee_id
  ) then
    raise exception 'Selected employee does not belong to this restaurant.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_restaurant_id::text, 0));

  insert into public.restaurant_document_storage_settings (restaurant_id)
  values (p_restaurant_id)
  on conflict (restaurant_id) do nothing;

  update public.restaurant_documents document
  set
    status = 'archived',
    archived_at = now(),
    updated_by_profile_id = v_profile_id
  where document.restaurant_id = p_restaurant_id
    and document.status = 'uploading'
    and document.created_at < now() - interval '2 hours'
    and not exists (
      select 1
      from storage.objects object
      where object.bucket_id = 'restaurant-documents'
        and object.name = document.object_path
    );

  select *
  into v_settings
  from public.restaurant_document_storage_settings setting
  where setting.restaurant_id = p_restaurant_id
  for update;

  if p_size_bytes > v_settings.max_file_bytes then
    raise exception 'Document exceeds the per-file upload limit.';
  end if;

  select coalesce(sum(document.size_bytes), 0)::bigint
  into v_used_bytes
  from public.restaurant_documents document
  where document.restaurant_id = p_restaurant_id
    and document.status in ('uploading', 'ready');

  if v_used_bytes + p_size_bytes > v_settings.total_limit_bytes then
    raise exception 'Restaurant document storage limit reached.';
  end if;

  v_object_path := p_restaurant_id::text || '/' || v_document_id::text;

  insert into public.restaurant_documents (
    id,
    restaurant_id,
    title,
    original_filename,
    object_path,
    mime_type,
    size_bytes,
    category,
    employee_id,
    document_date,
    expires_on,
    access_scope,
    note,
    status,
    created_by_profile_id,
    updated_by_profile_id
  )
  values (
    v_document_id,
    p_restaurant_id,
    btrim(p_title),
    btrim(p_original_filename),
    v_object_path,
    v_mime_type,
    p_size_bytes,
    p_category,
    p_employee_id,
    p_document_date,
    p_expires_on,
    p_access_scope,
    nullif(btrim(coalesce(p_note, '')), ''),
    'uploading',
    v_profile_id,
    v_profile_id
  );

  insert into public.restaurant_document_events (
    restaurant_id,
    document_id,
    event_type,
    actor_profile_id,
    details
  )
  values (
    p_restaurant_id,
    v_document_id,
    'upload_reserved',
    v_profile_id,
    jsonb_build_object('size_bytes', p_size_bytes, 'mime_type', v_mime_type)
  );

  return jsonb_build_object(
    'document_id', v_document_id,
    'object_path', v_object_path,
    'used_bytes', v_used_bytes + p_size_bytes,
    'total_limit_bytes', v_settings.total_limit_bytes,
    'max_file_bytes', v_settings.max_file_bytes
  );
end
$$;

create function public.finalize_restaurant_document_upload(
  p_restaurant_id uuid,
  p_document_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_profile_id uuid;
  v_document public.restaurant_documents%rowtype;
  v_object storage.objects%rowtype;
  v_actual_size bigint;
  v_actual_mime text;
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);
  v_profile_id := public.current_profile_id();

  select *
  into v_document
  from public.restaurant_documents document
  where document.restaurant_id = p_restaurant_id
    and document.id = p_document_id
  for update;

  if not found or v_document.status <> 'uploading' then
    raise exception 'Pending document upload not found.';
  end if;
  if v_document.access_scope = 'owner' and not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can finalize this document.';
  end if;

  select *
  into v_object
  from storage.objects object
  where object.bucket_id = 'restaurant-documents'
    and object.name = v_document.object_path
  limit 1;

  if not found then
    raise exception 'Uploaded document object was not found.';
  end if;

  v_actual_size := coalesce(
    nullif(v_object.metadata ->> 'size', '')::bigint,
    nullif(v_object.metadata ->> 'contentLength', '')::bigint
  );
  v_actual_mime := lower(coalesce(
    nullif(v_object.metadata ->> 'mimetype', ''),
    nullif(v_object.metadata ->> 'contentType', ''),
    ''
  ));

  if v_actual_size is distinct from v_document.size_bytes
      or v_actual_mime is distinct from v_document.mime_type then
    raise exception 'Uploaded document does not match its reservation.';
  end if;

  update public.restaurant_documents
  set
    status = 'ready',
    updated_by_profile_id = v_profile_id
  where restaurant_id = p_restaurant_id
    and id = p_document_id;

  insert into public.restaurant_document_events (
    restaurant_id,
    document_id,
    event_type,
    actor_profile_id,
    details
  )
  values (
    p_restaurant_id,
    p_document_id,
    'uploaded',
    v_profile_id,
    jsonb_build_object('size_bytes', v_document.size_bytes)
  );

  return jsonb_build_object('document_id', p_document_id, 'status', 'ready');
end
$$;

create function public.cancel_restaurant_document_upload(
  p_restaurant_id uuid,
  p_document_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_profile_id uuid;
  v_document public.restaurant_documents%rowtype;
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);
  v_profile_id := public.current_profile_id();

  select *
  into v_document
  from public.restaurant_documents document
  where document.restaurant_id = p_restaurant_id
    and document.id = p_document_id
  for update;

  if not found or v_document.status <> 'uploading' then
    return;
  end if;
  if v_document.access_scope = 'owner' and not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can cancel this document.';
  end if;
  if exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'restaurant-documents'
      and object.name = v_document.object_path
  ) then
    raise exception 'Remove the uploaded object before cancelling its reservation.';
  end if;

  update public.restaurant_documents
  set
    status = 'archived',
    archived_at = now(),
    updated_by_profile_id = v_profile_id
  where restaurant_id = p_restaurant_id
    and id = p_document_id;

  insert into public.restaurant_document_events (
    restaurant_id,
    document_id,
    event_type,
    actor_profile_id
  )
  values (p_restaurant_id, p_document_id, 'upload_cancelled', v_profile_id);
end
$$;

create function public.update_restaurant_document(
  p_restaurant_id uuid,
  p_document_id uuid,
  p_title text,
  p_category text,
  p_employee_id uuid default null,
  p_document_date date default null,
  p_expires_on date default null,
  p_access_scope text default 'management',
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_document public.restaurant_documents%rowtype;
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);
  v_profile_id := public.current_profile_id();

  select *
  into v_document
  from public.restaurant_documents document
  where document.restaurant_id = p_restaurant_id
    and document.id = p_document_id
    and document.status = 'ready'
  for update;

  if not found then
    raise exception 'Active document not found.';
  end if;
  if (v_document.access_scope = 'owner' or p_access_scope = 'owner')
      and not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can manage owner-only documents.';
  end if;
  if length(btrim(coalesce(p_title, ''))) not between 1 and 160 then
    raise exception 'Document title must contain between 1 and 160 characters.';
  end if;
  if p_category not in (
    'employee',
    'compliance',
    'legal',
    'insurance',
    'finance',
    'supplier',
    'operations',
    'other'
  ) then
    raise exception 'Document category is invalid.';
  end if;
  if p_access_scope not in ('management', 'owner') then
    raise exception 'Document access scope is invalid.';
  end if;
  if p_note is not null and length(p_note) > 2000 then
    raise exception 'Document note cannot exceed 2000 characters.';
  end if;
  if p_document_date is not null
      and p_expires_on is not null
      and p_expires_on < p_document_date then
    raise exception 'Expiry date cannot be before the document date.';
  end if;
  if p_employee_id is not null and not exists (
    select 1
    from public.employees employee
    where employee.restaurant_id = p_restaurant_id
      and employee.id = p_employee_id
  ) then
    raise exception 'Selected employee does not belong to this restaurant.';
  end if;

  update public.restaurant_documents
  set
    title = btrim(p_title),
    category = p_category,
    employee_id = p_employee_id,
    document_date = p_document_date,
    expires_on = p_expires_on,
    access_scope = p_access_scope,
    note = nullif(btrim(coalesce(p_note, '')), ''),
    updated_by_profile_id = v_profile_id
  where restaurant_id = p_restaurant_id
    and id = p_document_id;

  insert into public.restaurant_document_events (
    restaurant_id,
    document_id,
    event_type,
    actor_profile_id,
    details
  )
  values (
    p_restaurant_id,
    p_document_id,
    'metadata_updated',
    v_profile_id,
    jsonb_build_object('category', p_category, 'access_scope', p_access_scope)
  );
end
$$;

create function public.archive_restaurant_document(
  p_restaurant_id uuid,
  p_document_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_profile_id uuid;
  v_document public.restaurant_documents%rowtype;
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);
  v_profile_id := public.current_profile_id();

  select *
  into v_document
  from public.restaurant_documents document
  where document.restaurant_id = p_restaurant_id
    and document.id = p_document_id
    and document.status = 'ready'
  for update;

  if not found then
    raise exception 'Active document not found.';
  end if;
  if v_document.access_scope = 'owner' and not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can archive this document.';
  end if;
  if exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'restaurant-documents'
      and object.name = v_document.object_path
  ) then
    raise exception 'Remove the stored file before archiving its record.';
  end if;

  update public.restaurant_documents
  set
    status = 'archived',
    archived_at = now(),
    updated_by_profile_id = v_profile_id
  where restaurant_id = p_restaurant_id
    and id = p_document_id;

  insert into public.restaurant_document_events (
    restaurant_id,
    document_id,
    event_type,
    actor_profile_id
  )
  values (p_restaurant_id, p_document_id, 'archived', v_profile_id);
end
$$;

create function public.record_restaurant_document_download(
  p_restaurant_id uuid,
  p_document_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_document public.restaurant_documents%rowtype;
begin
  perform 1 from public.require_owner_or_manager_context(p_restaurant_id);
  v_profile_id := public.current_profile_id();

  select *
  into v_document
  from public.restaurant_documents document
  where document.restaurant_id = p_restaurant_id
    and document.id = p_document_id
    and document.status = 'ready';

  if not found then
    raise exception 'Active document not found.';
  end if;
  if v_document.access_scope = 'owner' and not public.is_owner(p_restaurant_id) then
    raise exception 'Only an owner can download this document.';
  end if;

  insert into public.restaurant_document_events (
    restaurant_id,
    document_id,
    event_type,
    actor_profile_id
  )
  values (p_restaurant_id, p_document_id, 'downloaded', v_profile_id);
end
$$;

alter table public.restaurant_document_storage_settings enable row level security;
alter table public.restaurant_documents enable row level security;
alter table public.restaurant_document_events enable row level security;

revoke all on table public.restaurant_document_storage_settings
  from public, anon, authenticated;
revoke all on table public.restaurant_documents
  from public, anon, authenticated;
revoke all on table public.restaurant_document_events
  from public, anon, authenticated;

grant all on table public.restaurant_document_storage_settings to service_role;
grant all on table public.restaurant_documents to service_role;
grant all on table public.restaurant_document_events to service_role;

revoke all on function public.guard_restaurant_document_event_history()
  from public, anon, authenticated, service_role;
revoke all on function public.document_storage_object_access(text,text,bigint,text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_restaurant_documents(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.begin_restaurant_document_upload(
  uuid,text,text,text,bigint,text,uuid,date,date,text,text
) from public, anon, authenticated, service_role;
revoke all on function public.finalize_restaurant_document_upload(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.cancel_restaurant_document_upload(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.update_restaurant_document(
  uuid,uuid,text,text,uuid,date,date,text,text
) from public, anon, authenticated, service_role;
revoke all on function public.archive_restaurant_document(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.record_restaurant_document_download(uuid,uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.document_storage_object_access(text,text,bigint,text)
  to authenticated;
grant execute on function public.get_restaurant_documents(uuid)
  to authenticated;
grant execute on function public.begin_restaurant_document_upload(
  uuid,text,text,text,bigint,text,uuid,date,date,text,text
) to authenticated;
grant execute on function public.finalize_restaurant_document_upload(uuid,uuid)
  to authenticated;
grant execute on function public.cancel_restaurant_document_upload(uuid,uuid)
  to authenticated;
grant execute on function public.update_restaurant_document(
  uuid,uuid,text,text,uuid,date,date,text,text
) to authenticated;
grant execute on function public.archive_restaurant_document(uuid,uuid)
  to authenticated;
grant execute on function public.record_restaurant_document_download(uuid,uuid)
  to authenticated;

notify pgrst, 'reload schema';

commit;
