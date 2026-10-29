create or replace function public.daily_refresh_onboarding_support_tasks()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  tasks jsonb := '[]'::jsonb;
  item jsonb;
begin
  if coalesce(new.support_tasks, '[]'::jsonb) @> '[{"key":"bpf_first_nda_year","status":"not_applicable"}]'::jsonb then new.first_nda_year := true; end if;
  if nullif(trim(coalesce(new.insee_document_url,'')), '') is null then tasks := tasks || jsonb_build_array(jsonb_build_object('key','insee','label','Avis INSEE à fournir','status','todo')); new.insee_document_pending := true; else new.insee_document_pending := false; end if;
  if new.qualiopi_status = 'yes' and nullif(trim(coalesce(new.qualiopi_certificate_url,'')), '') is null then tasks := tasks || jsonb_build_array(jsonb_build_object('key','qualiopi_certificate','label','Certificat Qualiopi à fournir','status','todo')); new.qualiopi_certificate_pending := true; else new.qualiopi_certificate_pending := false; end if;
  if new.first_nda_year then tasks := tasks || jsonb_build_array(jsonb_build_object('key','bpf_first_nda_year','label','Première année de NDA : BPF non requis','status','not_applicable')); new.nda_or_bpf_document_pending := false; elsif nullif(trim(coalesce(new.nda_or_bpf_document_url,'')), '') is null then tasks := tasks || jsonb_build_array(jsonb_build_object('key','nda_or_bpf','label','Dernier BPF à fournir','status','todo')); new.nda_or_bpf_document_pending := true; else new.nda_or_bpf_document_pending := false; end if;
  new.welcome_booklet_pending := false;
  for item in select value from jsonb_array_elements(coalesce(new.support_tasks,'[]'::jsonb)) loop if coalesce(item->>'key','') like 'trainer_cv:%' and item->>'status' = 'todo' then tasks := tasks || jsonb_build_array(item); end if; end loop;
  new.support_tasks := tasks;
  new.video_requested_at := null;
  return new;
end;
$function$;

update public.daily_onboarding
set welcome_booklet_pending = false,
    support_tasks = coalesce((select jsonb_agg(item) from jsonb_array_elements(coalesce(support_tasks,'[]'::jsonb)) item where item->>'key' <> 'welcome_booklet'),'[]'::jsonb)
where welcome_booklet_pending = true
   or coalesce(support_tasks,'[]'::jsonb) @> '[{"key":"welcome_booklet"}]'::jsonb;
