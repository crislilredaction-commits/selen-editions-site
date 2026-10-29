alter table public.daily_formation_registration_requests
  add column if not exists decision_status text not null default 'pending',
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_decision_id uuid,
  add column if not exists agent_review_requested_at timestamptz;

alter table public.daily_formation_registration_requests
  drop constraint if exists daily_formation_registration_requests_decision_status_check;

alter table public.daily_formation_registration_requests
  add constraint daily_formation_registration_requests_decision_status_check
  check (decision_status = any (array['pending'::text, 'agent_review'::text, 'accepted'::text]));

create table if not exists public.daily_registration_request_decisions (
  id uuid primary key default gen_random_uuid(),
  registration_request_id uuid not null references public.daily_formation_registration_requests(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id),
  actor_type text not null check (actor_type = any (array['organisation'::text, 'trainer'::text])),
  actor_user_id uuid not null references auth.users(id),
  trainer_profile_id uuid references public.daily_trainer_profiles(id),
  decision text not null check (decision = any (array['accepted'::text, 'refused'::text])),
  comment text,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint daily_registration_request_decisions_trainer_actor_check check (
    (actor_type = 'trainer' and trainer_profile_id is not null)
    or (actor_type = 'organisation' and trainer_profile_id is null)
  ),
  constraint daily_registration_request_decisions_actor_once unique (registration_request_id, actor_type, actor_user_id)
);

alter table public.daily_formation_registration_requests
  drop constraint if exists daily_formation_registration_requests_accepted_decision_id_fkey;

alter table public.daily_formation_registration_requests
  add constraint daily_formation_registration_requests_accepted_decision_id_fkey
  foreign key (accepted_decision_id) references public.daily_registration_request_decisions(id);

create index if not exists daily_registration_request_decisions_request_idx
  on public.daily_registration_request_decisions(registration_request_id, decided_at desc);
create index if not exists daily_registration_request_decisions_org_idx
  on public.daily_registration_request_decisions(organisation_id, decided_at desc);
create index if not exists daily_formation_registration_requests_decision_status_idx
  on public.daily_formation_registration_requests(decision_status, submitted_at desc);

alter table public.daily_registration_request_decisions enable row level security;

revoke all on public.daily_registration_request_decisions from anon, authenticated;
grant select, insert, update, delete on public.daily_registration_request_decisions to service_role;

create or replace function public.daily_record_registration_request_decision(
  p_request_id uuid,
  p_actor_user_id uuid,
  p_actor_type text,
  p_decision text,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_request public.daily_formation_registration_requests%rowtype;
  v_formation public.daily_formations%rowtype;
  v_org_id uuid;
  v_trainer_profile_id uuid;
  v_decision_id uuid;
  v_is_manager boolean := false;
  v_is_trainer boolean := false;
begin
  if p_actor_type not in ('organisation', 'trainer') then
    raise exception 'invalid actor type';
  end if;
  if p_decision not in ('accepted', 'refused') then
    raise exception 'invalid decision';
  end if;

  select * into v_request
  from public.daily_formation_registration_requests
  where id = p_request_id
  for update;
  if not found then raise exception 'registration request not found'; end if;

  select * into v_formation from public.daily_formations where id = v_request.formation_id;
  if not found then raise exception 'formation not found'; end if;
  v_org_id := v_formation.organisation_id;

  if v_request.decision_status = 'accepted' then
    raise exception 'registration request already accepted';
  end if;
  if v_request.decision_status = 'agent_review' then
    raise exception 'registration request awaiting agent review';
  end if;

  select exists (
    select 1
    from public.organisation_memberships m
    join public.organisation_membership_roles r on r.membership_id = m.id and r.role = 'manager'
    where m.organisation_id = v_org_id
      and m.user_id = p_actor_user_id
      and m.status = 'active'
  ) into v_is_manager;

  select tp.id into v_trainer_profile_id
  from public.daily_trainer_profiles tp
  join public.organisation_memberships m on m.id = tp.membership_id
  join public.organisation_membership_roles r on r.membership_id = m.id and r.role = 'trainer'
  where tp.organisation_id = v_org_id
    and tp.user_id = p_actor_user_id
    and tp.active = true
    and tp.status not in ('rejected', 'archived')
    and m.status = 'active'
    and exists (
      select 1 from jsonb_array_elements_text(coalesce(v_formation.allowed_trainer_ids, '[]'::jsonb)) x(value)
      where x.value = tp.id::text
    )
  limit 1;
  v_is_trainer := v_trainer_profile_id is not null;

  if p_actor_type = 'organisation' and not v_is_manager then
    raise exception 'manager permission required';
  end if;
  if p_actor_type = 'trainer' and not v_is_trainer then
    raise exception 'assigned trainer permission required';
  end if;

  insert into public.daily_registration_request_decisions(
    registration_request_id, organisation_id, actor_type, actor_user_id, trainer_profile_id, decision, comment
  ) values (
    p_request_id, v_org_id, p_actor_type, p_actor_user_id,
    case when p_actor_type = 'trainer' then v_trainer_profile_id else null end,
    p_decision, nullif(btrim(coalesce(p_comment, '')), '')
  ) returning id into v_decision_id;

  if p_decision = 'accepted' then
    update public.daily_formation_registration_requests
    set decision_status = 'accepted', accepted_at = now(), accepted_decision_id = v_decision_id,
        agent_review_requested_at = null, updated_at = now()
    where id = p_request_id;
  else
    update public.daily_formation_registration_requests
    set decision_status = 'agent_review', agent_review_requested_at = now(), updated_at = now()
    where id = p_request_id;
  end if;

  return jsonb_build_object(
    'request_id', p_request_id,
    'decision_id', v_decision_id,
    'decision', p_decision,
    'decision_status', case when p_decision = 'accepted' then 'accepted' else 'agent_review' end,
    'actor_type', p_actor_type,
    'trainer_profile_id', case when p_actor_type = 'trainer' then v_trainer_profile_id else null end
  );
end;
$$;

revoke all on function public.daily_record_registration_request_decision(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.daily_record_registration_request_decision(uuid, uuid, text, text, text) to service_role;

comment on table public.daily_registration_request_decisions is 'Historique canonique des accords/refus OF ou formateur sur les candidatures publiques Daily. Un seul accord suffit; un refus préalable renvoie la candidature en revue agent.';
comment on column public.daily_formation_registration_requests.decision_status is 'Etat canonique de validation: pending, agent_review après refus sans accord, accepted dès le premier accord OF ou formateur.';