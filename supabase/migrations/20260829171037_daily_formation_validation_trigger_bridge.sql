create or replace function public.daily_bridge_formation_validation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous public.daily_formations%rowtype;
  v_public_token text;
  v_public_enabled boolean;
begin
  if new.status = 'validated' and old.status is distinct from 'validated' and new.previous_version_id is not null then
    select * into v_previous from public.daily_formations where id = new.previous_version_id for update;
    if v_previous.id is not null and v_previous.status = 'validated' then
      v_public_token := v_previous.public_registration_token;
      v_public_enabled := coalesce(v_previous.public_registration_enabled, true);
      update public.daily_formations set status = 'archived', archived_at = now(), public_registration_token = replace(gen_random_uuid()::text, '-', ''), public_registration_enabled = false, updated_at = now() where id = v_previous.id;
      new.public_registration_token := coalesce(v_public_token, replace(gen_random_uuid()::text, '-', ''));
      new.public_registration_enabled := v_public_enabled;
      new.archived_at := null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.daily_bridge_formation_validation() from public, anon, authenticated;
grant execute on function public.daily_bridge_formation_validation() to service_role;

drop trigger if exists daily_bridge_formation_validation_trg on public.daily_formations;
create trigger daily_bridge_formation_validation_trg
before update of status on public.daily_formations
for each row
execute function public.daily_bridge_formation_validation();
