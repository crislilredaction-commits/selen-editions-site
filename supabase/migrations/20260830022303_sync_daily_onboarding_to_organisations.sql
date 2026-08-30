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

drop trigger if exists trg_sync_daily_onboarding_to_organisation on public.daily_onboarding;
create trigger trg_sync_daily_onboarding_to_organisation
after insert or update of
  organisation_name,
  siret,
  nda_number,
  address,
  manager_first_name,
  manager_last_name,
  qualiopi_status,
  platform_contact_first_name,
  platform_contact_last_name,
  platform_contact_email
on public.daily_onboarding
for each row
execute function public.sync_daily_onboarding_to_organisation();

with primary_membership as (
  select distinct on (om.user_id)
    om.user_id,
    om.organisation_id
  from public.organisation_memberships om
  where om.status = 'active'
  order by om.user_id, om.joined_at asc, om.created_at asc
), linked as (
  select
    pm.organisation_id,
    d.*
  from primary_membership pm
  join public.daily_onboarding d on d.user_id = pm.user_id
)
update public.organisations o
set
  name = coalesce(nullif(btrim(linked.organisation_name), ''), o.name),
  company_name = coalesce(nullif(btrim(linked.organisation_name), ''), o.company_name),
  siret = coalesce(nullif(btrim(linked.siret), ''), o.siret),
  nda_number = coalesce(nullif(btrim(linked.nda_number), ''), o.nda_number),
  nda_status = case
    when nullif(btrim(linked.nda_number), '') is not null then 'registered'
    else o.nda_status
  end,
  address = coalesce(nullif(btrim(linked.address), ''), o.address),
  administrative_address = coalesce(nullif(btrim(linked.address), ''), o.administrative_address),
  contact_name = coalesce(
    nullif(
      btrim(concat_ws(' ',
        nullif(btrim(linked.platform_contact_first_name), ''),
        nullif(btrim(linked.platform_contact_last_name), '')
      )),
      ''
    ),
    o.contact_name
  ),
  administrative_email = coalesce(
    nullif(lower(btrim(linked.platform_contact_email)), ''),
    o.administrative_email
  ),
  legal_representative_name = coalesce(
    nullif(
      btrim(concat_ws(' ',
        nullif(btrim(linked.manager_first_name), ''),
        nullif(btrim(linked.manager_last_name), '')
      )),
      ''
    ),
    o.legal_representative_name
  ),
  qualiopi_status = case linked.qualiopi_status
    when 'yes' then 'certified'
    when 'no' then 'not_certified'
    when 'planned' then 'not_certified'
    else o.qualiopi_status
  end
from linked
where o.id = linked.organisation_id;

comment on function public.sync_daily_onboarding_to_organisation() is
  'Synchronise les informations d onboarding Daily vers l organisme canonique lie, sans effacer les valeurs canoniques avec des champs vides.';
