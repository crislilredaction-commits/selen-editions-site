create table if not exists public.daily_mission_orders (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  trainer_profile_id uuid not null references public.daily_trainer_profiles(id) on delete restrict,
  created_by uuid not null,
  updated_by uuid,
  ordering_party_user_id uuid not null,
  trainer_user_id uuid,
  trainer_name text not null,
  trainer_email text,
  trainer_address text,
  trainer_siret text,
  order_type text not null default 'one_off' check (order_type in ('one_off','collaboration')),
  start_date date,
  end_date date,
  session_ids uuid[] not null default '{}',
  rate_type text not null check (rate_type in ('hourly','daily')),
  rate_amount numeric(12,2) not null check (rate_amount >= 0),
  payment_terms text not null,
  travel_costs_covered boolean not null default false,
  travel_costs_terms text,
  missions text[] not null default '{}',
  mission_details text,
  qualiopi_process_commitment boolean not null default true,
  issue_place text not null,
  issue_date date not null default current_date,
  status text not null default 'pending_signatures' check (status in ('pending_signatures','partially_signed','signed','cancelled')),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_mission_orders_period_check check (end_date is null or start_date is null or end_date >= start_date),
  constraint daily_mission_orders_travel_terms_check check (travel_costs_covered = false or nullif(trim(travel_costs_terms),'') is not null),
  constraint daily_mission_orders_mission_check check (cardinality(missions) > 0 or nullif(trim(mission_details),'') is not null)
);

create index if not exists daily_mission_orders_organisation_idx on public.daily_mission_orders(organisation_id, created_at desc);
create index if not exists daily_mission_orders_trainer_idx on public.daily_mission_orders(trainer_profile_id, created_at desc);

create table if not exists public.daily_mission_order_signatures (
  id uuid primary key default gen_random_uuid(),
  mission_order_id uuid not null references public.daily_mission_orders(id) on delete cascade,
  signatory_type text not null check (signatory_type in ('ordering_party','trainer')),
  user_id uuid not null,
  signatory_name text not null,
  signatory_email text,
  consent_text text not null,
  signature_data text,
  proof_hash text not null,
  signed_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (mission_order_id, signatory_type)
);

create index if not exists daily_mission_order_signatures_order_idx on public.daily_mission_order_signatures(mission_order_id);

alter table public.daily_mission_orders enable row level security;
alter table public.daily_mission_order_signatures enable row level security;

revoke all on table public.daily_mission_orders from anon, authenticated;
revoke all on table public.daily_mission_order_signatures from anon, authenticated;
revoke all on table public.daily_mission_orders from service_role;
revoke all on table public.daily_mission_order_signatures from service_role;
grant select, insert, update on table public.daily_mission_orders to service_role;
grant select, insert on table public.daily_mission_order_signatures to service_role;

create or replace function public.daily_lock_mission_order_after_signature()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.daily_mission_order_signatures s
    where s.mission_order_id = old.id
  ) then
    if new.organisation_id is distinct from old.organisation_id
      or new.trainer_profile_id is distinct from old.trainer_profile_id
      or new.ordering_party_user_id is distinct from old.ordering_party_user_id
      or new.trainer_user_id is distinct from old.trainer_user_id
      or new.trainer_name is distinct from old.trainer_name
      or new.trainer_email is distinct from old.trainer_email
      or new.trainer_address is distinct from old.trainer_address
      or new.trainer_siret is distinct from old.trainer_siret
      or new.order_type is distinct from old.order_type
      or new.start_date is distinct from old.start_date
      or new.end_date is distinct from old.end_date
      or new.session_ids is distinct from old.session_ids
      or new.rate_type is distinct from old.rate_type
      or new.rate_amount is distinct from old.rate_amount
      or new.payment_terms is distinct from old.payment_terms
      or new.travel_costs_covered is distinct from old.travel_costs_covered
      or new.travel_costs_terms is distinct from old.travel_costs_terms
      or new.missions is distinct from old.missions
      or new.mission_details is distinct from old.mission_details
      or new.qualiopi_process_commitment is distinct from old.qualiopi_process_commitment
      or new.issue_place is distinct from old.issue_place
      or new.issue_date is distinct from old.issue_date
    then
      raise exception 'mission order is locked after first signature';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.daily_lock_mission_order_after_signature() from public, anon, authenticated;

create trigger daily_mission_orders_lock_after_signature
before update on public.daily_mission_orders
for each row execute function public.daily_lock_mission_order_after_signature();

comment on table public.daily_mission_orders is 'Ordres de mission Daily pour formateurs internes ou sous-traitants, figés dès la première signature.';
comment on table public.daily_mission_order_signatures is 'Preuves de double signature donneur d ordre / formateur des ordres de mission Daily.';
