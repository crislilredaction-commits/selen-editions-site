create or replace function public.daily_sync_legacy_trainer_to_profile(p_user_id uuid, p_first_name text, p_last_name text, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organisation_id uuid;
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_display_name text := nullif(trim(concat_ws(' ', nullif(trim(coalesce(p_first_name,'')),''), nullif(trim(coalesce(p_last_name,'')),''))), '');
begin
  if v_email is null then
    return;
  end if;

  select om.organisation_id
    into v_organisation_id
  from public.organisation_memberships om
  where om.user_id = p_user_id
    and om.status = 'active'
  order by om.joined_at asc
  limit 1;

  if v_organisation_id is null then
    return;
  end if;

  update public.daily_trainer_profiles
     set display_name = coalesce(v_display_name, display_name),
         professional_email = v_email,
         active = true,
         updated_at = now()
   where organisation_id = v_organisation_id
     and lower(coalesce(professional_email,'')) = v_email;

  if not found then
    insert into public.daily_trainer_profiles (
      organisation_id, professional_email, display_name, engagement_type, status, active
    ) values (
      v_organisation_id, v_email, coalesce(v_display_name, v_email), 'external', 'draft', true
    );
  end if;
end;
$$;

create or replace function public.daily_sync_legacy_trainer_row_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.daily_sync_legacy_trainer_to_profile(new.user_id, new.first_name, new.last_name, new.email);
  return new;
end;
$$;

drop trigger if exists daily_trainers_sync_profile on public.daily_trainers;
create trigger daily_trainers_sync_profile
after insert or update of first_name, last_name, email on public.daily_trainers
for each row execute function public.daily_sync_legacy_trainer_row_trigger();

create or replace function public.daily_sync_trainers_when_membership_activates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  trainer record;
begin
  if new.status <> 'active' then
    return new;
  end if;

  for trainer in
    select first_name, last_name, email
    from public.daily_trainers
    where user_id = new.user_id
  loop
    perform public.daily_sync_legacy_trainer_to_profile(new.user_id, trainer.first_name, trainer.last_name, trainer.email);
  end loop;
  return new;
end;
$$;

drop trigger if exists daily_membership_sync_legacy_trainers on public.organisation_memberships;
create trigger daily_membership_sync_legacy_trainers
after insert or update of status on public.organisation_memberships
for each row execute function public.daily_sync_trainers_when_membership_activates();
