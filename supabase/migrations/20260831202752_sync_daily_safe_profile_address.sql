-- Keep the organisation's canonical address aligned with the Daily administrative profile.
-- Preserve the deployed RPC contract (void return type, defaults and permission checks)
-- while extending only the address write already mirrored by onboarding.

create or replace function public.daily_client_update_safe_organisation(
  p_organisation_id uuid,
  p_administrative_email text default null,
  p_administrative_phone text default null,
  p_administrative_address text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if (select auth.uid()) is null then
    raise exception 'authenticated user required';
  end if;

  if not (
    public.has_organisation_role(p_organisation_id, 'manager')
    or public.has_organisation_permission_block(p_organisation_id, 'legal_profile')
  ) then
    raise exception 'legal profile permission required';
  end if;

  update public.organisations
  set address = nullif(btrim(coalesce(p_administrative_address, '')), ''),
      administrative_email = nullif(btrim(coalesce(p_administrative_email, '')), ''),
      administrative_phone = nullif(btrim(coalesce(p_administrative_phone, '')), ''),
      administrative_address = nullif(btrim(coalesce(p_administrative_address, '')), '')
  where id = p_organisation_id;

  if not found then
    raise exception 'organisation not found';
  end if;
end;
$function$;
