-- Keep the organisation's canonical address aligned with the Daily administrative profile.
-- Onboarding already writes the same address to both columns; subsequent safe-profile
-- edits must preserve that invariant for Studio and other consumers of organisations.address.

create or replace function public.daily_client_update_safe_organisation(
  p_organisation_id uuid,
  p_administrative_address text,
  p_administrative_email text,
  p_administrative_phone text
)
returns setof public.organisations
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.daily_is_active_member(
    p_organisation_id,
    array['owner', 'admin', 'manager']
  ) then
    raise exception 'Insufficient rights';
  end if;

  return query
  update public.organisations
  set address = p_administrative_address,
      administrative_address = p_administrative_address,
      administrative_email = p_administrative_email,
      administrative_phone = p_administrative_phone
  where id = p_organisation_id
  returning *;
end;
$function$;
