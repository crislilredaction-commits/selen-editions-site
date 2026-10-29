create policy "Trainers can create own certification proof documents"
on public.daily_documents
for insert
to authenticated
with check (
  linked_object_type = 'trainer_certification'
  and document_type = 'trainer_qualification_proof'
  and created_by = (select auth.uid())
  and exists (
    select 1
    from public.daily_trainer_certifications certification
    join public.daily_trainer_profiles trainer
      on trainer.id = certification.trainer_profile_id
    where certification.id = daily_documents.linked_object_id
      and trainer.organisation_id = daily_documents.organisation_id
      and trainer.user_id = (select auth.uid())
      and trainer.active = true
  )
);

create policy "Trainers can link own certification proof documents"
on public.daily_trainer_profile_documents
for insert
to authenticated
with check (
  document_purpose = 'qualification'
  and exists (
    select 1
    from public.daily_trainer_profiles trainer
    where trainer.id = daily_trainer_profile_documents.trainer_profile_id
      and trainer.user_id = (select auth.uid())
      and trainer.active = true
  )
  and exists (
    select 1
    from public.daily_documents document
    join public.daily_trainer_certifications certification
      on certification.id = document.linked_object_id
    where document.id = daily_trainer_profile_documents.daily_document_id
      and document.linked_object_type = 'trainer_certification'
      and document.document_type = 'trainer_qualification_proof'
      and certification.trainer_profile_id = daily_trainer_profile_documents.trainer_profile_id
      and document.created_by = (select auth.uid())
  )
);
