-- Exclut les inscriptions abandonnées de tous les calculs de complétude
-- liés aux documents de fin de formation.

create or replace function public.daily_sync_session_posttraining_checklist(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
 active_enrolments integer:=0; active_slots integer:=0; settled_records integer:=0; expected_records integer:=0; eligible_certificates integer:=0; expected_documents integer:=0; current_documents integer:=0; validated_documents integer:=0; target_status text; target_note text;
begin
 if p_session_id is null then return; end if;
 select count(*) into active_enrolments from public.daily_session_enrolments e where e.session_id=p_session_id and e.status not in ('declined','cancelled','abandoned');
 select count(*) into active_slots from public.daily_attendance_slots s where s.session_id=p_session_id and s.status<>'cancelled';
 expected_records:=active_enrolments*active_slots;
 select count(*) into settled_records from public.daily_attendance_records r join public.daily_session_enrolments e on e.id=r.enrolment_id join public.daily_attendance_slots s on s.id=r.slot_id where r.session_id=p_session_id and e.session_id=p_session_id and e.status not in ('declined','cancelled','abandoned') and s.session_id=p_session_id and s.status<>'cancelled' and r.status<>'pending';
 if expected_records>0 and settled_records=expected_records then
  select count(distinct e.id) into eligible_certificates from public.daily_session_enrolments e where e.session_id=p_session_id and e.status not in ('declined','cancelled','abandoned') and exists(select 1 from public.daily_attendance_records r join public.daily_attendance_slots s on s.id=r.slot_id where r.session_id=p_session_id and r.enrolment_id=e.id and s.session_id=p_session_id and s.status<>'cancelled' and r.status='present');
 end if;
 expected_documents:=case when active_slots>0 then 1+eligible_certificates else 0 end;
 with required_docs as (
  select d.id,d.status from public.daily_documents d where d.is_current=true and d.document_type='attendance_summary' and d.linked_object_type='session' and d.linked_object_id=p_session_id
  union all
  select d.id,d.status from public.daily_documents d join public.daily_session_enrolments e on e.id=d.linked_object_id where d.is_current=true and d.document_type='completion_certificate' and d.linked_object_type='enrolment' and e.session_id=p_session_id and e.status not in ('declined','cancelled','abandoned') and exists(select 1 from public.daily_attendance_records r join public.daily_attendance_slots s on s.id=r.slot_id where r.session_id=p_session_id and r.enrolment_id=e.id and s.session_id=p_session_id and s.status<>'cancelled' and r.status='present')
 ) select count(*),count(*) filter(where status in ('validated','published','signed','active')) into current_documents,validated_documents from required_docs;
 if active_slots=0 then target_status:='todo';target_note:='Aucun créneau de présence disponible pour préparer les documents de fin.';
 elsif expected_records>0 and settled_records<expected_records then target_status:=case when settled_records>0 or current_documents>0 then 'in_progress' else 'todo' end;target_note:=settled_records::text||'/'||expected_records::text||' présence(s) finalisée(s) avant génération des documents de fin.';
 elsif current_documents=0 then target_status:='todo';target_note:=expected_documents::text||' document(s) de fin attendu(s).';
 elsif current_documents<expected_documents then target_status:='in_progress';target_note:=current_documents::text||'/'||expected_documents::text||' document(s) de fin préparé(s).';
 elsif validated_documents<expected_documents then target_status:='to_review';target_note:=current_documents::text||'/'||expected_documents::text||' document(s) de fin préparé(s), contrôle Selen requis.';
 else target_status:='validated';target_note:=expected_documents::text||' document(s) de fin validé(s).';end if;
 update public.daily_session_checklist_items set status=target_status,note=target_note where session_id=p_session_id and item_key='posttraining_documents' and status<>'not_applicable' and (status is distinct from target_status or note is distinct from target_note);
end;$function$;
