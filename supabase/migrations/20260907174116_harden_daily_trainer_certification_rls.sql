-- Restreint les ecritures directes des agents Selen sur les certifications
-- et leurs justificatifs, tout en preservant la lecture agent et les droits
-- existants des responsables/gestionnaires de l'organisme.

-- 1. Certifications : retirer l'acces ALL du staff et separer lecture/ecriture.
drop policy if exists "daily_trainer_certifications_staff_all"
  on public.daily_trainer_certifications;

drop policy if exists "daily_trainer_certifications_staff_select"
  on public.daily_trainer_certifications;
create policy "daily_trainer_certifications_staff_select"
  on public.daily_trainer_certifications
  for select
  to authenticated
  using (public.daily_is_selen_staff());

-- Les anciennes policies manager s'appuyaient sur can_manage_daily_trainers(),
-- qui inclut le staff Selen. On conserve les memes droits cote organisme,
-- mais sans faire heriter les agents Selen des droits d'ecriture.
drop policy if exists "daily_trainer_certifications_manager_select"
  on public.daily_trainer_certifications;
drop policy if exists "daily_trainer_certifications_manager_insert"
  on public.daily_trainer_certifications;
drop policy if exists "daily_trainer_certifications_manager_update"
  on public.daily_trainer_certifications;
drop policy if exists "daily_trainer_certifications_manager_delete"
  on public.daily_trainer_certifications;

create policy "daily_trainer_certifications_manager_select"
  on public.daily_trainer_certifications
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.daily_trainer_profiles dtp
      where dtp.id = daily_trainer_certifications.trainer_profile_id
        and (
          public.has_organisation_role(dtp.organisation_id, 'manager')
          or public.has_organisation_permission_block(dtp.organisation_id, 'trainers')
        )
    )
  );

create policy "daily_trainer_certifications_manager_insert"
  on public.daily_trainer_certifications
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.daily_trainer_profiles dtp
      where dtp.id = daily_trainer_certifications.trainer_profile_id
        and (
          public.has_organisation_role(dtp.organisation_id, 'manager')
          or public.has_organisation_permission_block(dtp.organisation_id, 'trainers')
        )
    )
  );

create policy "daily_trainer_certifications_manager_update"
  on public.daily_trainer_certifications
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.daily_trainer_profiles dtp
      where dtp.id = daily_trainer_certifications.trainer_profile_id
        and (
          public.has_organisation_role(dtp.organisation_id, 'manager')
          or public.has_organisation_permission_block(dtp.organisation_id, 'trainers')
        )
    )
  )
  with check (
    exists (
      select 1
      from public.daily_trainer_profiles dtp
      where dtp.id = daily_trainer_certifications.trainer_profile_id
        and (
          public.has_organisation_role(dtp.organisation_id, 'manager')
          or public.has_organisation_permission_block(dtp.organisation_id, 'trainers')
        )
    )
  );

create policy "daily_trainer_certifications_manager_delete"
  on public.daily_trainer_certifications
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.daily_trainer_profiles dtp
      where dtp.id = daily_trainer_certifications.trainer_profile_id
        and (
          public.has_organisation_role(dtp.organisation_id, 'manager')
          or public.has_organisation_permission_block(dtp.organisation_id, 'trainers')
        )
    )
  );

-- 2. Justificatifs : le staff conserve la lecture de tous les documents Daily,
-- mais ne peut plus modifier directement un justificatif de certification.
drop policy if exists "Selen staff can manage Daily documents"
  on public.daily_documents;

drop policy if exists "Selen staff can read Daily documents"
  on public.daily_documents;
create policy "Selen staff can read Daily documents"
  on public.daily_documents
  for select
  to authenticated
  using (public.daily_is_selen_staff());

create policy "Selen staff can insert non-certification Daily documents"
  on public.daily_documents
  for insert
  to authenticated
  with check (
    public.daily_is_selen_staff()
    and not (
      document_type = 'trainer_qualification_proof'
      and linked_object_type = 'trainer_certification'
    )
  );

create policy "Selen staff can update non-certification Daily documents"
  on public.daily_documents
  for update
  to authenticated
  using (
    public.daily_is_selen_staff()
    and not (
      document_type = 'trainer_qualification_proof'
      and linked_object_type = 'trainer_certification'
    )
  )
  with check (
    public.daily_is_selen_staff()
    and not (
      document_type = 'trainer_qualification_proof'
      and linked_object_type = 'trainer_certification'
    )
  );

create policy "Selen staff can delete non-certification Daily documents"
  on public.daily_documents
  for delete
  to authenticated
  using (
    public.daily_is_selen_staff()
    and not (
      document_type = 'trainer_qualification_proof'
      and linked_object_type = 'trainer_certification'
    )
  );

-- Ferme aussi les chemins generiques de creation/mise a jour pour le staff
-- uniquement sur les justificatifs de certification. Les gestionnaires de
-- l'organisme conservent leurs droits existants.
drop policy if exists "Authorised members can create Daily documents"
  on public.daily_documents;
create policy "Authorised members can create Daily documents"
  on public.daily_documents
  for insert
  to authenticated
  with check (
    public.can_manage_daily_documents(organisation_id)
    and (
      not (
        document_type = 'trainer_qualification_proof'
        and linked_object_type = 'trainer_certification'
      )
      or not public.daily_is_selen_staff()
    )
  );

drop policy if exists "Authorised members can update Daily documents"
  on public.daily_documents;
create policy "Authorised members can update Daily documents"
  on public.daily_documents
  for update
  to authenticated
  using (
    public.can_manage_daily_documents(organisation_id)
    and (
      not (
        document_type = 'trainer_qualification_proof'
        and linked_object_type = 'trainer_certification'
      )
      or not public.daily_is_selen_staff()
    )
  )
  with check (
    public.can_manage_daily_documents(organisation_id)
    and (
      not (
        document_type = 'trainer_qualification_proof'
        and linked_object_type = 'trainer_certification'
      )
      or not public.daily_is_selen_staff()
    )
  );
