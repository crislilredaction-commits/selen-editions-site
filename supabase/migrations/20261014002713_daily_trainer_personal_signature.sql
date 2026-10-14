begin;
create or replace function public.daily_assert_document_delegation(p_assistance_id uuid,p_token_hash text,p_organisation_id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_token public.selen_agent_assistance_tokens%rowtype;
begin
 select * into v_token from public.selen_agent_assistance_tokens where id=p_assistance_id and token_hash=p_token_hash
   and organisation_id=p_organisation_id and status='active' and expires_at>clock_timestamp();
 if v_token.id is null or v_token.agent_user_id is null or coalesce(v_token.metadata->>'scope','daily_workspace')<>'daily_workspace' then raise exception 'delegation invalid or expired' using errcode='42501'; end if;
 if not exists(select 1 from public.agent_profiles where is_active and (user_id=v_token.agent_user_id or (user_id is null and lower(btrim(email))=lower(btrim(v_token.agent_email)))))
   and not exists(select 1 from public.selen_admin_users where is_active and user_id=v_token.agent_user_id) then raise exception 'active Studio actor required' using errcode='42501'; end if;
 return v_token.agent_user_id;
end;
$$;
revoke all on function public.daily_assert_document_delegation(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.daily_assert_document_delegation(uuid,text,uuid) to service_role;

create unique index if not exists daily_trainer_presence_signature_unique
on public.daily_documents(organisation_id,session_id,(metadata->>'trainer_profile_id'),(metadata->>'slot_id'))
where document_type='trainer_signature_evidence' and status='signed' and is_current;

create or replace function public.daily_guard_trainer_signature_evidence()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op in ('UPDATE','DELETE') and old.document_type='trainer_signature_evidence' then
   raise exception 'trainer signature evidence is immutable' using errcode='42501'; end if;
 if tg_op<>'DELETE' and new.document_type='trainer_signature_evidence' and current_user not in ('service_role','postgres','supabase_admin') then
   raise exception 'personal signature API required' using errcode='42501'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$$;
revoke all on function public.daily_guard_trainer_signature_evidence() from public,anon,authenticated;
create trigger daily_guard_trainer_signature_evidence before insert or update or delete on public.daily_documents
for each row execute function public.daily_guard_trainer_signature_evidence();

create or replace function public.daily_record_trainer_presence_signature(
 p_document_id uuid,p_organisation_id uuid,p_session_id uuid,p_trainer_id uuid,p_actor_user_id uuid,
 p_slot_id uuid,p_storage_path text,p_sha256 text,p_size_bytes bigint,p_confirmed boolean default false,p_actor_email text default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_trainer public.daily_trainer_profiles%rowtype;
 v_session public.daily_sessions%rowtype;
 v_slot public.daily_attendance_slots%rowtype;
 v_existing public.daily_documents%rowtype;
 v_actor_email text; v_now timestamptz:=clock_timestamp(); v_metadata jsonb;
begin
 if p_confirmed is not true then raise exception 'personal signature consent required' using errcode='22023'; end if;
 -- Identity claims come only from the authenticated API; service_role is the
 -- sole caller. No privilege on auth.users is needed or added.
 v_actor_email:=p_actor_email;
 select * into v_trainer from public.daily_trainer_profiles where id=p_trainer_id and organisation_id=p_organisation_id
   and active and status not in ('rejected','archived') for share;
 if v_trainer.id is null or not coalesce((v_trainer.user_id=p_actor_user_id or
   (v_trainer.user_id is null and v_actor_email is not null and lower(btrim(v_trainer.professional_email))=lower(btrim(v_actor_email)))),false) then
   raise exception 'personal trainer identity required' using errcode='42501';
 end if;
 select * into v_session from public.daily_sessions where id=p_session_id and organisation_id=p_organisation_id for update;
 if v_session.id is null or not coalesce(to_jsonb(v_session.trainer_ids) ? p_trainer_id::text,false)
   or v_session.status in ('archived','cancelled') then raise exception 'trainer session outside scope' using errcode='42501'; end if;
 select * into v_slot from public.daily_attendance_slots where id=p_slot_id and session_id=p_session_id and organisation_id=p_organisation_id for share;
 if v_slot.id is null or v_slot.status='cancelled' then raise exception 'attendance slot unavailable' using errcode='22023'; end if;
 if (v_slot.slot_date+v_slot.starts_at) at time zone 'Europe/Paris' > clock_timestamp() then
   raise exception 'future attendance cannot be signed' using errcode='22023'; end if;
 if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_size_bytes is null or p_size_bytes<64
   or p_storage_path is distinct from 'daily/'||p_organisation_id||'/trainer/'||p_trainer_id||'/'||p_session_id||'/trainer_signature/'||p_document_id||'.png' then
   raise exception 'signature evidence invalid' using errcode='22023'; end if;
 select * into v_existing from public.daily_documents where organisation_id=p_organisation_id and session_id=p_session_id
   and document_type='trainer_signature_evidence' and status='signed' and is_current
   and metadata->>'slot_id'=p_slot_id::text and metadata->>'trainer_profile_id'=p_trainer_id::text;
 if v_existing.id is not null then
   if v_existing.sha256 is distinct from p_sha256 or v_existing.created_by is distinct from p_actor_user_id then
     raise exception 'trainer presence already signed' using errcode='23505'; end if;
   return jsonb_build_object('signature_id',v_existing.id,'signed_at',v_existing.signed_at,'replayed',true);
 end if;
 v_now:=clock_timestamp();
 v_metadata:=jsonb_build_object('source','trainer_workspace_self_signature','trainer_profile_id',p_trainer_id,
   'trainer_name',v_trainer.display_name,'actor_user_id',p_actor_user_id,'slot_id',p_slot_id,'slot_date',v_slot.slot_date,
   'starts_at',v_slot.starts_at,'ends_at',v_slot.ends_at,'signed_at',v_now,'consent',true);
 insert into public.daily_documents(id,organisation_id,formation_id,session_id,document_type,linked_object_type,linked_object_id,
   version,status,logical_name,bucket,storage_path,mime_type,size_bytes,sha256,created_by,updated_by,is_current,signed_at,metadata)
 values(p_document_id,p_organisation_id,v_session.formation_id,p_session_id,'trainer_signature_evidence','session',p_session_id,
   1,'signed','Émargement formateur — '||v_trainer.display_name,'documents',p_storage_path,'image/png',p_size_bytes,p_sha256,
   p_actor_user_id,p_actor_user_id,true,v_now,v_metadata);
 insert into public.daily_audit_logs(organisation_id,actor_user_id,actor_type,actor_role,object_type,object_id,action,occurred_at,after_data,context,origin)
 values(p_organisation_id,p_actor_user_id,'organisation_user','trainer','daily_document',p_document_id,'trainer_presence_signed',v_now,
   v_metadata,jsonb_build_object('session_id',p_session_id,'signature_sha256',p_sha256),'Vitrine');
 return jsonb_build_object('signature_id',p_document_id,'signed_at',v_now,'replayed',false);
end;
$$;
revoke all on function public.daily_record_trainer_presence_signature(uuid,uuid,uuid,uuid,uuid,uuid,text,text,bigint,boolean,text) from public,anon,authenticated;
grant execute on function public.daily_record_trainer_presence_signature(uuid,uuid,uuid,uuid,uuid,uuid,text,text,bigint,boolean,text) to service_role;
commit;
