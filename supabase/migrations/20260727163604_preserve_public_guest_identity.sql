-- A website visitor may prove possession of a booking contact, but that does
-- not make anonymous input the canonical source for an existing guest profile.
-- Existing canonical guest profiles are entirely read-only to this anonymous
-- flow. Store submitted booking values on the reservation itself instead.
begin;

do $protect_public_guest_identity$
declare
  v_definition text;
  v_next text;
  v_old_guest_update text := $old$
    update public.reservation_guests
    set display_name = v_guest_name,
      email = coalesce(v_email, email),
      normalized_email = coalesce(v_normalized_email, normalized_email),
      phone = coalesce(v_phone, phone),
      normalized_phone = coalesce(v_normalized_phone, normalized_phone)
    where restaurant_id = v_hold.restaurant_id
      and id = v_guest_id;
$old$;
  v_new_guest_update text := $new$
    null;
$new$;
  v_old_reservation_metadata text := $old$
    jsonb_build_object(
      'public_channel_id', v_channel.channel_id,
      'public_hold_id', v_hold.id
    )
$old$;
  v_new_reservation_metadata text := $new$
    jsonb_build_object(
      'public_channel_id', v_channel.channel_id,
      'public_hold_id', v_hold.id,
      'booking_guest_snapshot', jsonb_strip_nulls(jsonb_build_object(
        'display_name', v_guest_name,
        'email', v_email,
        'phone', v_phone,
        'language_code', coalesce(
          nullif(btrim(p_guest->>'language_code'), ''),
          'en'
        )
      ))
    )
$new$;
begin
  select replace(
    pg_get_functiondef(
      'public.reservation_public_confirm(text,text,text,text,jsonb)'::regprocedure
    ),
    chr(13),
    ''
  )
  into v_definition;

  v_next := replace(
    v_definition,
    v_old_guest_update,
    v_new_guest_update
  );
  if v_next = v_definition then
    raise exception 'Public guest identity update contract drifted.';
  end if;
  v_definition := v_next;

  v_next := replace(
    v_definition,
    v_old_reservation_metadata,
    v_new_reservation_metadata
  );
  if v_next = v_definition then
    raise exception 'Public booking guest snapshot contract drifted.';
  end if;

  execute v_next;
end
$protect_public_guest_identity$;

revoke all on function public.reservation_public_confirm(
  text,text,text,text,jsonb
) from public, anon, authenticated;
grant execute on function public.reservation_public_confirm(
  text,text,text,text,jsonb
) to service_role;

notify pgrst, 'reload schema';

commit;
