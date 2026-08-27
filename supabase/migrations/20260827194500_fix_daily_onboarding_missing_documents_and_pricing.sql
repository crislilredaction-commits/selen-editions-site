alter table public.daily_onboarding add column if not exists first_nda_year boolean not null default false;

create or replace function public.daily_refresh_onboarding_support_tasks()
returns trigger
language plpgsql
as $$
declare
  tasks jsonb := '[]'::jsonb;
  item jsonb;
begin
  if coalesce(new.support_tasks, '[]'::jsonb) @> '[{"key":"bpf_first_nda_year","status":"not_applicable"}]'::jsonb then
    new.first_nda_year := true;
  end if;

  if nullif(trim(coalesce(new.insee_document_url,'')), '') is null then
    tasks := tasks || jsonb_build_array(jsonb_build_object('key','insee','label','Avis INSEE à fournir','status','todo'));
    new.insee_document_pending := true;
  else new.insee_document_pending := false;
  end if;

  if new.qualiopi_status = 'yes' and nullif(trim(coalesce(new.qualiopi_certificate_url,'')), '') is null then
    tasks := tasks || jsonb_build_array(jsonb_build_object('key','qualiopi_certificate','label','Certificat Qualiopi à fournir','status','todo'));
    new.qualiopi_certificate_pending := true;
  else new.qualiopi_certificate_pending := false;
  end if;

  if new.first_nda_year then
    tasks := tasks || jsonb_build_array(jsonb_build_object('key','bpf_first_nda_year','label','Première année de NDA : BPF non requis','status','not_applicable'));
    new.nda_or_bpf_document_pending := false;
  elsif nullif(trim(coalesce(new.nda_or_bpf_document_url,'')), '') is null then
    tasks := tasks || jsonb_build_array(jsonb_build_object('key','nda_or_bpf','label','Dernier BPF à fournir','status','todo'));
    new.nda_or_bpf_document_pending := true;
  else new.nda_or_bpf_document_pending := false;
  end if;

  if nullif(trim(coalesce(new.welcome_booklet_url,'')), '') is null then
    tasks := tasks || jsonb_build_array(jsonb_build_object('key','welcome_booklet','label','Livret d''accueil à fournir','status','todo'));
    new.welcome_booklet_pending := true;
  else new.welcome_booklet_pending := false;
  end if;

  for item in select value from jsonb_array_elements(coalesce(new.support_tasks,'[]'::jsonb)) loop
    if coalesce(item->>'key','') like 'trainer_cv:%' and item->>'status' = 'todo' then
      tasks := tasks || jsonb_build_array(item);
    end if;
  end loop;

  new.support_tasks := tasks;
  new.video_requested_at := null;
  return new;
end;
$$;

drop trigger if exists trg_daily_refresh_onboarding_support_tasks on public.daily_onboarding;
create trigger trg_daily_refresh_onboarding_support_tasks before insert or update on public.daily_onboarding for each row execute function public.daily_refresh_onboarding_support_tasks();

update public.daily_onboarding set updated_at = updated_at;

create or replace function public.daily_normalize_subscription_price()
returns trigger
language plpgsql
as $$
begin
  if new.base_monthly_amount_cents = 8900 then
    new.base_monthly_amount_cents := 6900;
    if coalesce(new.pricing_rule_accepted_version,'') = 'daily_150_2026_07' then
      new.pricing_rule_accepted_version := 'daily_150_2026_08_69';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_daily_normalize_subscription_price on public.daily_subscriptions;
create trigger trg_daily_normalize_subscription_price before insert or update on public.daily_subscriptions for each row execute function public.daily_normalize_subscription_price();

update public.daily_subscriptions
set base_monthly_amount_cents = 6900,
    pricing_rule_accepted_version = case when pricing_rule_accepted_version = 'daily_150_2026_07' then 'daily_150_2026_08_69' else pricing_rule_accepted_version end,
    updated_at = now()
where base_monthly_amount_cents = 8900;
