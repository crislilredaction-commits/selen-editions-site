alter table public.client_reminders
  drop constraint if exists client_reminders_type_check;

alter table public.client_reminders
  add constraint client_reminders_type_check
  check (
    reminder_type = any (
      array[
        'preaudit_incomplete_15_days'::text,
        'audit_blanc_booking_reminder_7_days'::text,
        'audit_blanc_48h_reminder'::text,
        'nda_inactive_9_days'::text,
        'qualiopi_surveillance_window_open'::text,
        'qualiopi_renewal_4_months'::text,
        'qualiopi_certificate_expiry'::text
      ]
    )
  );

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.daily_sync_qualiopi_reminders_for_organisation(p_organisation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_org public.organisations%rowtype;
  v_email text;
  v_rows integer;
  v_due_at timestamptz;
  v_metadata jsonb;
begin
  select * into v_org
  from public.organisations
  where id = p_organisation_id;

  if not found then
    return;
  end if;

  v_email := nullif(trim(coalesce(v_org.administrative_email, v_org.email, '')), '');
  v_metadata := jsonb_build_object(
    'organisation_id', v_org.id,
    'organisation_name', v_org.name,
    'source', 'daily_qualiopi_cycle',
    'href', '/client/daily/qualite'
  );

  if v_org.qualiopi_status = 'yes' and v_email is not null and v_org.qualiopi_surveillance_window_start is not null then
    v_due_at := v_org.qualiopi_surveillance_window_start::timestamp at time zone 'Europe/Paris';

    update public.client_reminders
    set client_email = v_email,
        due_at = v_due_at,
        subject = 'Qualiopi : préparez votre audit de surveillance',
        body_text = 'Votre fenêtre d’audit de surveillance Qualiopi commence. Renseignez la date prévue de l’audit dans Selen afin de préparer votre pré-audit.',
        body_html = '<p>Votre fenêtre d’audit de surveillance Qualiopi commence.</p><p>Renseignez la date prévue de l’audit dans Selen afin de préparer votre pré-audit.</p>',
        suggested_subject = 'Qualiopi : préparez votre audit de surveillance',
        suggested_body_text = 'Votre fenêtre d’audit de surveillance Qualiopi commence. Renseignez la date prévue de l’audit dans Selen afin de préparer votre pré-audit.',
        suggested_body_html = '<p>Votre fenêtre d’audit de surveillance Qualiopi commence.</p><p>Renseignez la date prévue de l’audit dans Selen afin de préparer votre pré-audit.</p>',
        metadata = v_metadata || jsonb_build_object(
          'cycle_stage', 'surveillance',
          'window_start', v_org.qualiopi_surveillance_window_start,
          'window_end', v_org.qualiopi_surveillance_window_end
        ),
        stage_label = 'Audit de surveillance Qualiopi',
        expected_action = 'Renseigner la date de l’audit de surveillance dans Selen.'
    where dedupe_key = 'daily:qualiopi:surveillance:' || v_org.id::text
      and status in ('draft', 'ready', 'postponed');

    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      insert into public.client_reminders (
        client_email, reminder_type, status, subject, body_html, body_text, due_at,
        metadata, dedupe_key, suggested_subject, suggested_body_html, suggested_body_text,
        prestation_type, prestation_id, stage_label, expected_action
      ) values (
        v_email, 'qualiopi_surveillance_window_open', 'ready',
        'Qualiopi : préparez votre audit de surveillance',
        '<p>Votre fenêtre d’audit de surveillance Qualiopi commence.</p><p>Renseignez la date prévue de l’audit dans Selen afin de préparer votre pré-audit.</p>',
        'Votre fenêtre d’audit de surveillance Qualiopi commence. Renseignez la date prévue de l’audit dans Selen afin de préparer votre pré-audit.',
        v_due_at,
        v_metadata || jsonb_build_object(
          'cycle_stage', 'surveillance',
          'window_start', v_org.qualiopi_surveillance_window_start,
          'window_end', v_org.qualiopi_surveillance_window_end
        ),
        'daily:qualiopi:surveillance:' || v_org.id::text,
        'Qualiopi : préparez votre audit de surveillance',
        '<p>Votre fenêtre d’audit de surveillance Qualiopi commence.</p><p>Renseignez la date prévue de l’audit dans Selen afin de préparer votre pré-audit.</p>',
        'Votre fenêtre d’audit de surveillance Qualiopi commence. Renseignez la date prévue de l’audit dans Selen afin de préparer votre pré-audit.',
        'daily_qualiopi', v_org.id, 'Audit de surveillance Qualiopi',
        'Renseigner la date de l’audit de surveillance dans Selen.'
      );
    end if;
  else
    update public.client_reminders
    set status = 'ignored'
    where dedupe_key = 'daily:qualiopi:surveillance:' || v_org.id::text
      and status in ('draft', 'ready', 'postponed');
  end if;

  if v_org.qualiopi_status = 'yes' and v_email is not null and v_org.qualiopi_renewal_reminder_on is not null then
    v_due_at := v_org.qualiopi_renewal_reminder_on::timestamp at time zone 'Europe/Paris';

    update public.client_reminders
    set client_email = v_email,
        due_at = v_due_at,
        subject = 'Qualiopi : anticipez votre renouvellement',
        body_text = 'Votre échéance de renouvellement Qualiopi approche dans quatre mois. Programmez l’audit et mettez à jour les informations utiles dans Selen.',
        body_html = '<p>Votre échéance de renouvellement Qualiopi approche dans quatre mois.</p><p>Programmez l’audit et mettez à jour les informations utiles dans Selen.</p>',
        suggested_subject = 'Qualiopi : anticipez votre renouvellement',
        suggested_body_text = 'Votre échéance de renouvellement Qualiopi approche dans quatre mois. Programmez l’audit et mettez à jour les informations utiles dans Selen.',
        suggested_body_html = '<p>Votre échéance de renouvellement Qualiopi approche dans quatre mois.</p><p>Programmez l’audit et mettez à jour les informations utiles dans Selen.</p>',
        metadata = v_metadata || jsonb_build_object(
          'cycle_stage', 'renewal',
          'valid_until', v_org.qualiopi_valid_until
        ),
        stage_label = 'Renouvellement Qualiopi',
        expected_action = 'Programmer le renouvellement Qualiopi et renseigner la date d’audit.'
    where dedupe_key = 'daily:qualiopi:renewal:' || v_org.id::text
      and status in ('draft', 'ready', 'postponed');

    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      insert into public.client_reminders (
        client_email, reminder_type, status, subject, body_html, body_text, due_at,
        metadata, dedupe_key, suggested_subject, suggested_body_html, suggested_body_text,
        prestation_type, prestation_id, stage_label, expected_action
      ) values (
        v_email, 'qualiopi_renewal_4_months', 'ready',
        'Qualiopi : anticipez votre renouvellement',
        '<p>Votre échéance de renouvellement Qualiopi approche dans quatre mois.</p><p>Programmez l’audit et mettez à jour les informations utiles dans Selen.</p>',
        'Votre échéance de renouvellement Qualiopi approche dans quatre mois. Programmez l’audit et mettez à jour les informations utiles dans Selen.',
        v_due_at,
        v_metadata || jsonb_build_object(
          'cycle_stage', 'renewal',
          'valid_until', v_org.qualiopi_valid_until
        ),
        'daily:qualiopi:renewal:' || v_org.id::text,
        'Qualiopi : anticipez votre renouvellement',
        '<p>Votre échéance de renouvellement Qualiopi approche dans quatre mois.</p><p>Programmez l’audit et mettez à jour les informations utiles dans Selen.</p>',
        'Votre échéance de renouvellement Qualiopi approche dans quatre mois. Programmez l’audit et mettez à jour les informations utiles dans Selen.',
        'daily_qualiopi', v_org.id, 'Renouvellement Qualiopi',
        'Programmer le renouvellement Qualiopi et renseigner la date d’audit.'
      );
    end if;
  else
    update public.client_reminders
    set status = 'ignored'
    where dedupe_key = 'daily:qualiopi:renewal:' || v_org.id::text
      and status in ('draft', 'ready', 'postponed');
  end if;

  if v_org.qualiopi_status = 'yes' and v_email is not null and v_org.qualiopi_valid_until is not null then
    v_due_at := v_org.qualiopi_valid_until::timestamp at time zone 'Europe/Paris';

    update public.client_reminders
    set client_email = v_email,
        due_at = v_due_at,
        subject = 'Qualiopi : votre certificat arrive à échéance',
        body_text = 'Votre certificat Qualiopi arrive à échéance. Déposez le nouveau certificat dans Selen dès qu’il est disponible afin de conserver un dossier à jour.',
        body_html = '<p>Votre certificat Qualiopi arrive à échéance.</p><p>Déposez le nouveau certificat dans Selen dès qu’il est disponible afin de conserver un dossier à jour.</p>',
        suggested_subject = 'Qualiopi : votre certificat arrive à échéance',
        suggested_body_text = 'Votre certificat Qualiopi arrive à échéance. Déposez le nouveau certificat dans Selen dès qu’il est disponible afin de conserver un dossier à jour.',
        suggested_body_html = '<p>Votre certificat Qualiopi arrive à échéance.</p><p>Déposez le nouveau certificat dans Selen dès qu’il est disponible afin de conserver un dossier à jour.</p>',
        metadata = v_metadata || jsonb_build_object(
          'cycle_stage', 'certificate_expiry',
          'valid_until', v_org.qualiopi_valid_until
        ),
        stage_label = 'Certificat Qualiopi',
        expected_action = 'Remplacer le certificat Qualiopi arrivé à échéance.'
    where dedupe_key = 'daily:qualiopi:certificate-expiry:' || v_org.id::text
      and status in ('draft', 'ready', 'postponed');

    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      insert into public.client_reminders (
        client_email, reminder_type, status, subject, body_html, body_text, due_at,
        metadata, dedupe_key, suggested_subject, suggested_body_html, suggested_body_text,
        prestation_type, prestation_id, stage_label, expected_action
      ) values (
        v_email, 'qualiopi_certificate_expiry', 'ready',
        'Qualiopi : votre certificat arrive à échéance',
        '<p>Votre certificat Qualiopi arrive à échéance.</p><p>Déposez le nouveau certificat dans Selen dès qu’il est disponible afin de conserver un dossier à jour.</p>',
        'Votre certificat Qualiopi arrive à échéance. Déposez le nouveau certificat dans Selen dès qu’il est disponible afin de conserver un dossier à jour.',
        v_due_at,
        v_metadata || jsonb_build_object(
          'cycle_stage', 'certificate_expiry',
          'valid_until', v_org.qualiopi_valid_until
        ),
        'daily:qualiopi:certificate-expiry:' || v_org.id::text,
        'Qualiopi : votre certificat arrive à échéance',
        '<p>Votre certificat Qualiopi arrive à échéance.</p><p>Déposez le nouveau certificat dans Selen dès qu’il est disponible afin de conserver un dossier à jour.</p>',
        'Votre certificat Qualiopi arrive à échéance. Déposez le nouveau certificat dans Selen dès qu’il est disponible afin de conserver un dossier à jour.',
        'daily_qualiopi', v_org.id, 'Certificat Qualiopi',
        'Remplacer le certificat Qualiopi arrivé à échéance.'
      );
    end if;
  else
    update public.client_reminders
    set status = 'ignored'
    where dedupe_key = 'daily:qualiopi:certificate-expiry:' || v_org.id::text
      and status in ('draft', 'ready', 'postponed');
  end if;
end;
$$;

revoke all on function private.daily_sync_qualiopi_reminders_for_organisation(uuid) from public, anon, authenticated;
grant execute on function private.daily_sync_qualiopi_reminders_for_organisation(uuid) to service_role;

create or replace function private.daily_sync_qualiopi_reminders_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  perform private.daily_sync_qualiopi_reminders_for_organisation(new.id);
  return new;
end;
$$;

revoke all on function private.daily_sync_qualiopi_reminders_trigger() from public, anon, authenticated;

drop trigger if exists organisations_sync_qualiopi_reminders on public.organisations;
create trigger organisations_sync_qualiopi_reminders
after insert or update of
  qualiopi_status,
  qualiopi_valid_from,
  qualiopi_valid_until,
  administrative_email,
  email
on public.organisations
for each row
execute function private.daily_sync_qualiopi_reminders_trigger();

select private.daily_sync_qualiopi_reminders_for_organisation(id)
from public.organisations
where qualiopi_status = 'yes';
