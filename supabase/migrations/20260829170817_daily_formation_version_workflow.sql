alter table public.daily_formations
  add column if not exists positioning_questionnaire_document_url text;

comment on column public.daily_formations.positioning_questionnaire_document_url is
  'URL interne du questionnaire de positionnement Word/PDF importé pour cette version de formation.';

create or replace function public.daily_validate_formation_version(
  p_formation_id uuid,
  p_validation_note text default null
)
returns public.daily_formations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.daily_formations%rowtype;
  v_previous public.daily_formations%rowtype;
  v_result public.daily_formations%rowtype;
  v_public_token text;
  v_public_enabled boolean;
begin
  select * into v_current from public.daily_formations where id = p_formation_id for update;
  if not found then raise exception 'Formation introuvable.'; end if;
  if v_current.status not in ('review', 'correction_requested', 'draft') then raise exception 'Cette version ne peut pas être validée depuis son statut actuel (%).', v_current.status; end if;
  if v_current.previous_version_id is not null then select * into v_previous from public.daily_formations where id = v_current.previous_version_id for update; end if;
  if v_previous.id is not null and v_previous.status = 'validated' then
    v_public_token := v_previous.public_registration_token;
    v_public_enabled := coalesce(v_previous.public_registration_enabled, true);
    update public.daily_formations set status = 'archived', archived_at = now(), public_registration_token = replace(gen_random_uuid()::text, '-', ''), public_registration_enabled = false, updated_at = now() where id = v_previous.id;
    update public.daily_formations set status = 'validated', validation_note = nullif(btrim(coalesce(p_validation_note, '')), ''), archived_at = null, public_registration_token = coalesce(v_public_token, replace(gen_random_uuid()::text, '-', '')), public_registration_enabled = v_public_enabled, updated_at = now() where id = v_current.id returning * into v_result;
  else
    update public.daily_formations set status = 'validated', validation_note = nullif(btrim(coalesce(p_validation_note, '')), ''), archived_at = null, public_registration_enabled = coalesce(public_registration_enabled, true), updated_at = now() where id = v_current.id returning * into v_result;
  end if;
  return v_result;
end;
$$;

revoke all on function public.daily_validate_formation_version(uuid, text) from public, anon, authenticated;
grant execute on function public.daily_validate_formation_version(uuid, text) to service_role;
