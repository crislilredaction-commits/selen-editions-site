-- Keep the canonical legal organisation identity aligned with Daily onboarding.
-- The onboarding sync already mirrors the display/company name, SIRET, NDA,
-- address and contacts. Mirror the same non-empty organisation name to
-- organisations.legal_name so Studio and Daily cannot diverge after an edit.

create or replace function public.sync_daily_onboarding_to_organisation()
returns trigger
language plpgsql
set search_path = 'public'
as $$
declare
  target_organisation_id uuid;
  contact_full_name text;
  manager_full_name text;
begin
  select om.organisation_id
    into target_organisation_id
  from public.organisation_memberships om
  where om.user_id = new.user_id
    and om.status = 'active'
  order by om.joined_at asc, om.created_at asc
  limit 1;

  if target_organisation_id is null then
    return new;
  end if;

  contact_full_name := nullif(
    btrim(concat_ws(' ',
      nullif(btrim(new.platform_contact_first_name), ''),
      nullif(btrim(new.platform_contact_last_name), '')
    )),
    ''
  );
  manager_full_name := nullif(
    btrim(concat_ws(' ',
      nullif(btrim(new.manager_first_name), ''),
      nullif(btrim(new.manager_last_name), '')
    )),
    ''
  );

  update public.organisations o
  set
    name = coalesce(nullif(btrim(new.organisation_name), ''), o.name),
    company_name = coalesce(nullif(btrim(new.organisation_name), ''), o.company_name),
    legal_name = coalesce(nullif(btrim(new.organisation_name), ''), o.legal_name),
    siret = coalesce(nullif(btrim(new.siret), ''), o.siret),
    nda_number = coalesce(nullif(btrim(new.nda_number), ''), o.nda_number),
    nda_status = case
      when nullif(btrim(new.nda_number), '') is not null then 'registered'
      else o.nda_status
    end,
    address = coalesce(nullif(btrim(new.address), ''), o.address),
    administrative_address = coalesce(nullif(btrim(new.address), ''), o.administrative_address),
    contact_name = coalesce(contact_full_name, o.contact_name),
    administrative_email = coalesce(
      nullif(lower(btrim(new.platform_contact_email)), ''),
      o.administrative_email
    ),
    legal_representative_name = coalesce(manager_full_name, o.legal_representative_name),
    qualiopi_status = case new.qualiopi_status
      when 'yes' then 'certified'
      when 'no' then 'not_certified'
      when 'planned' then 'not_certified'
      else o.qualiopi_status
    end
  where o.id = target_organisation_id;

  return new;
end;
$$;

comment on function public.sync_daily_onboarding_to_organisation() is
  'Synchronise les informations d onboarding Daily vers l organisme canonique lie, y compris sa raison sociale legale, sans effacer les valeurs canoniques avec des champs vides.';
