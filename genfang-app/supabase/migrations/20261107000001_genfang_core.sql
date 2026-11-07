-- GENFANG kerneskema (Supabase / Postgres 15+)
--
-- Sikkerhedsmodel:
--  * LÆSNING: rollen `authenticated` (Supabase-JWT) kan KUN læse rækker i egne virksomheder (RLS).
--  * SKRIVNING: ingen direkte INSERT/UPDATE/DELETE for klienter. Alle ændringer sker via
--    SECURITY DEFINER-funktioner, som kun `service_role` (Next.js-serveren) må kalde. Serveren har
--    forinden kørt sikkerhedslaget (guard) og tjekket sessionen. Funktionerne tjekker igen
--    medlemskab, rolle, version, status og nødstop – atomisk i én transaktion.
--  * AUDIT: kan kun tilføjes. UPDATE/DELETE blokeres af trigger – også for service_role.
--  * PLATFORMENS EJER: har ingen læseadgang til virksomhedernes kundedata – kun aggregater.

-- gen_random_uuid() er indbygget fra Postgres 13 – ingen udvidelse nødvendig.

create schema if not exists app;

-- ------------------------------------------------------------------ enums
create type app.role as enum ('owner', 'staff');
create type app.inquiry_status as enum ('ny', 'udkast_klar', 'godkendt', 'afvist');
create type app.urgency as enum ('akut', 'normal', 'lav');
create type app.quote_status as enum ('kladde', 'afventer_godkendelse', 'sendt', 'accepteret', 'afvist', 'udloebet', 'faktureret');
create type app.escalation_state as enum ('afventer_kvittering', 'kvitteret');
create type app.followup_state as enum ('forslag', 'godkendt', 'afvist');
create type app.outbox_kind as enum ('svar', 'tilbud', 'opfoelgning', 'eskalering');
create type app.outbox_state as enum ('blokeret_testversion', 'klar', 'sendt', 'fejlet');

-- ------------------------------------------------------------------ platform
create table public.platform_settings (
  id boolean primary key default true check (id),
  emergency_stop boolean not null default false,
  stopped_at timestamptz,
  stopped_by uuid,
  reason text check (char_length(reason) <= 300),
  -- Sættes først til true, når udsendelse er juridisk og teknisk godkendt.
  delivery_enabled boolean not null default false
);
insert into public.platform_settings default values;

create table public.platform_admins (
  user_id uuid primary key,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ virksomheder
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  trade text not null default 'VVS',
  timezone text not null default 'Europe/Copenhagen',
  opening_hours jsonb not null default '{}'::jsonb,
  plan_id text not null default 'pilot' check (plan_id in ('pilot', 'business')),
  plan_price_dkk integer not null default 995 check (plan_price_dkk >= 0),
  paused boolean not null default false,
  dpa_signed_at timestamptz,
  retention_days integer not null default 730 check (retention_days between 30 and 3650),
  created_at timestamptz not null default now()
);

create table public.memberships (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null,
  role app.role not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index on public.memberships (user_id);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  title text not null,
  phone text,
  on_call boolean not null default false,
  user_id uuid
);
create index on public.employees (tenant_id);

create table public.price_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  label text not null,
  amount_dkk integer not null check (amount_dkk >= 0),
  unit text not null check (unit in ('fast', 'pr_time', 'fra'))
);
create index on public.price_items (tenant_id);

create table public.calendar_slots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  state text not null default 'ledig' check (state in ('ledig', 'reserveret')),
  source text not null default 'testkalender'
);
create index on public.calendar_slots (tenant_id, starts_at);

-- ------------------------------------------------------------------ kunder og sager
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  address text,
  marketing_consent boolean not null default false,
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, tenant_id)
);
create index on public.customers (tenant_id);
create index on public.customers (tenant_id, lower(email));
create index on public.customers (tenant_id, phone);

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null,
  channel text not null check (channel in ('mail', 'formular', 'telefon')),
  subject text not null check (char_length(subject) <= 160),
  message text not null check (char_length(message) <= 4000),
  address text,
  received_at timestamptz not null default now(),
  first_response_at timestamptz,
  category text not null check (category in ('akut', 'tilbud', 'service', 'andet')),
  urgency app.urgency not null,
  emergency jsonb,
  missing_info text[] not null default '{}',
  status app.inquiry_status not null default 'ny',
  draft_text text check (char_length(draft_text) <= 5000),
  draft_by text check (draft_by in ('worker-02', 'legacy')),
  draft_edited_by uuid,
  draft_basis jsonb,
  version integer not null default 1,
  decided_by uuid,
  decided_at timestamptz,
  escalation_to uuid references public.employees(id),
  escalation_reason text check (char_length(escalation_reason) <= 300),
  escalation_at timestamptz,
  escalation_state app.escalation_state,
  escalation_ack_by uuid,
  escalation_ack_at timestamptz,
  -- Tenant-konsistens: kunden SKAL tilhøre samme virksomhed som sagen.
  constraint inquiries_customer_same_tenant foreign key (customer_id, tenant_id) references public.customers(id, tenant_id) on delete cascade,
  unique (id, tenant_id)
);
create index on public.inquiries (tenant_id, status, urgency, received_at desc);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null,
  inquiry_id uuid,
  title text not null,
  amount_dkk integer not null check (amount_dkk >= 0),
  status app.quote_status not null default 'kladde',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  valid_days integer not null default 30 check (valid_days between 1 and 365),
  responded_at timestamptz,
  invoiced_at timestamptz,
  paid_at timestamptz,
  follow_ups integer not null default 0 check (follow_ups between 0 and 2),
  version integer not null default 1,
  constraint quotes_customer_same_tenant foreign key (customer_id, tenant_id) references public.customers(id, tenant_id) on delete cascade,
  constraint quotes_inquiry_same_tenant foreign key (inquiry_id, tenant_id) references public.inquiries(id, tenant_id),
  check (status <> 'faktureret' or invoiced_at is not null),
  check (paid_at is null or status = 'faktureret')
);
create index on public.quotes (tenant_id, status);

create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null check (kind in ('tilbud_ubesvaret', 'mangler_oplysninger')),
  quote_id uuid references public.quotes(id) on delete cascade,
  inquiry_id uuid references public.inquiries(id) on delete cascade,
  draft text not null,
  legal_basis text not null,
  allowed boolean not null,
  state app.followup_state not null default 'forslag',
  created_at timestamptz not null default now(),
  version integer not null default 1,
  check ((quote_id is null) <> (inquiry_id is null))
);
create index on public.follow_ups (tenant_id, state);

create table public.worker_runs (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  worker text not null check (worker in ('worker-01', 'worker-02', 'worker-03', 'worker-04')),
  at timestamptz not null default now(),
  status text not null check (status in ('ok', 'fejl', 'blokeret', 'stoppet')),
  summary text not null,
  error text,
  ai_tokens integer not null default 0 check (ai_tokens >= 0)
);
create index on public.worker_runs (tenant_id, at desc);

create table public.outbox (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind app.outbox_kind not null,
  ref text not null,
  created_at timestamptz not null default now(),
  state app.outbox_state not null default 'blokeret_testversion',
  -- Én udsendelse pr. sag/tilbud/forslag – uanset hvor mange enheder der trykker.
  unique (tenant_id, kind, ref)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  tenant_id uuid references public.tenants(id) on delete set null,
  user_id uuid,
  action text not null,
  target text,
  detail text
);
create index on public.audit_log (tenant_id, at desc);

create or replace function app.audit_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'audit_log er kun til tilføjelse' using errcode = '42501';
end $$;
create trigger audit_no_update before update or delete on public.audit_log
  for each row execute function app.audit_append_only();
create trigger audit_no_truncate before truncate on public.audit_log
  for each statement execute function app.audit_append_only();

-- ------------------------------------------------------------------ hjælpefunktioner
create or replace function app.current_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
$$;

create or replace function app.is_member(p_tenant uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from public.memberships m where m.tenant_id = p_tenant and m.user_id = app.current_user_id())
$$;

create or replace function app.member_role(p_tenant uuid, p_user uuid) returns app.role
language sql stable security definer set search_path = public, app as $$
  select m.role from public.memberships m where m.tenant_id = p_tenant and m.user_id = p_user
$$;

create or replace function app.automation_stopped(p_tenant uuid) returns text
language sql stable security definer set search_path = public, app as $$
  select case
    when (select emergency_stop from public.platform_settings) then 'nødstop'
    when (select paused from public.tenants where id = p_tenant) then 'pause'
    else null end
$$;

-- ------------------------------------------------------------------ RLS
do $$
declare t text;
begin
  foreach t in array array['tenants','memberships','employees','price_items','calendar_slots','customers','inquiries','quotes','follow_ups','worker_runs','outbox','audit_log','platform_settings','platform_admins']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Kun SELECT for indloggede brugere – og kun egne virksomheder.
grant usage on schema app to authenticated, service_role;
grant select on public.tenants, public.memberships, public.employees, public.price_items, public.calendar_slots,
  public.customers, public.inquiries, public.quotes, public.follow_ups, public.worker_runs to authenticated;

create policy member_read on public.tenants for select to authenticated using (app.is_member(id));
create policy own_membership on public.memberships for select to authenticated using (user_id = app.current_user_id());
create policy member_read on public.employees for select to authenticated using (app.is_member(tenant_id));
create policy member_read on public.price_items for select to authenticated using (app.is_member(tenant_id));
create policy member_read on public.calendar_slots for select to authenticated using (app.is_member(tenant_id));
create policy member_read on public.customers for select to authenticated using (app.is_member(tenant_id));
create policy member_read on public.inquiries for select to authenticated using (app.is_member(tenant_id));
create policy member_read on public.follow_ups for select to authenticated
  using (app.is_member(tenant_id) and app.member_role(tenant_id, app.current_user_id()) = 'owner');
create policy member_read on public.worker_runs for select to authenticated using (app.is_member(tenant_id));
-- Medarbejdere ser tilbud, men omsætning (fakturering/betaling) vises kun for ejere i appen.
create policy member_read on public.quotes for select to authenticated using (app.is_member(tenant_id));
-- audit_log, outbox, platform_*: ingen læsning for klienter. Læses kun via serveren.

-- ------------------------------------------------------------------ skrivefunktioner (kun service_role)
-- Fejlkoder: P0001 + besked 'not_found' | 'forbidden' | 'conflict' | 'stopped' | 'invalid'
-- VIGTIGT: kald som `select * from app.decide_reply(...)` (eller supabase.rpc). Brug ALDRIG
-- `select (app.decide_reply(...)).*` – Postgres kalder så funktionen én gang pr. kolonne.

create or replace function app.decide_reply(
  p_tenant uuid, p_user uuid, p_inquiry uuid, p_decision text, p_expected_version integer, p_final_text text default null
) returns public.inquiries
language plpgsql security definer set search_path = public, app as $$
declare r public.inquiries; v_role app.role;
begin
  v_role := app.member_role(p_tenant, p_user);
  if v_role is null then raise exception 'forbidden'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'invalid'; end if;

  select * into r from public.inquiries where id = p_inquiry and tenant_id = p_tenant for update;
  if not found then raise exception 'not_found'; end if;
  if r.status <> 'udkast_klar' or r.draft_text is null then raise exception 'conflict'; end if;
  if r.version <> p_expected_version then raise exception 'conflict'; end if;

  if p_decision = 'approve' then
    if app.automation_stopped(p_tenant) is not null then raise exception 'stopped'; end if;
    if p_final_text is not null and char_length(trim(p_final_text)) < 2 then raise exception 'invalid'; end if;
    update public.inquiries set
      draft_text = coalesce(p_final_text, draft_text),
      draft_edited_by = case when p_final_text is not null and p_final_text <> r.draft_text then p_user else draft_edited_by end,
      first_response_at = coalesce(first_response_at, now()),
      status = 'godkendt', version = version + 1, decided_by = p_user, decided_at = now()
    where id = p_inquiry returning * into r;
    insert into public.outbox (tenant_id, kind, ref) values (p_tenant, 'svar', p_inquiry::text);
  else
    update public.inquiries set status = 'afvist', version = version + 1, decided_by = p_user, decided_at = now()
    where id = p_inquiry returning * into r;
  end if;

  insert into public.audit_log (tenant_id, user_id, action, target, detail) values (p_tenant, p_user, p_decision, p_inquiry::text, 'version ' || r.version);
  return r;
end $$;

create or replace function app.decide_quote(p_tenant uuid, p_user uuid, p_quote uuid, p_decision text, p_expected_version integer)
returns public.quotes
language plpgsql security definer set search_path = public, app as $$
declare q public.quotes;
begin
  if app.member_role(p_tenant, p_user) is distinct from 'owner' then raise exception 'forbidden'; end if;
  select * into q from public.quotes where id = p_quote and tenant_id = p_tenant for update;
  if not found then raise exception 'not_found'; end if;
  if q.status <> 'afventer_godkendelse' or q.version <> p_expected_version then raise exception 'conflict'; end if;
  if p_decision = 'approve' then
    if app.automation_stopped(p_tenant) is not null then raise exception 'stopped'; end if;
    update public.quotes set status = 'sendt', sent_at = now(), version = version + 1 where id = p_quote returning * into q;
    insert into public.outbox (tenant_id, kind, ref) values (p_tenant, 'tilbud', p_quote::text);
  elsif p_decision = 'reject' then
    update public.quotes set status = 'kladde', version = version + 1 where id = p_quote returning * into q;
  else raise exception 'invalid'; end if;
  insert into public.audit_log (tenant_id, user_id, action, target) values (p_tenant, p_user, 'quote_' || p_decision, p_quote::text);
  return q;
end $$;

create or replace function app.escalate(p_tenant uuid, p_user uuid, p_inquiry uuid, p_reason text)
returns public.inquiries
language plpgsql security definer set search_path = public, app as $$
declare r public.inquiries; e public.employees;
begin
  if app.member_role(p_tenant, p_user) is null then raise exception 'forbidden'; end if;
  select * into r from public.inquiries where id = p_inquiry and tenant_id = p_tenant for update;
  if not found then raise exception 'not_found'; end if;
  if r.escalation_state = 'afventer_kvittering' then raise exception 'conflict'; end if;
  select * into e from public.employees where tenant_id = p_tenant order by on_call desc, (title = 'Ejer') desc limit 1;
  if not found then raise exception 'invalid'; end if;
  update public.inquiries set escalation_to = e.id, escalation_reason = left(coalesce(nullif(trim(p_reason), ''), 'Eskaleret manuelt'), 300),
    escalation_at = now(), escalation_state = 'afventer_kvittering', urgency = 'akut', version = version + 1
  where id = p_inquiry returning * into r;
  insert into public.outbox (tenant_id, kind, ref) values (p_tenant, 'eskalering', p_inquiry::text || '@' || r.version);
  insert into public.audit_log (tenant_id, user_id, action, target, detail) values (p_tenant, p_user, 'escalate', p_inquiry::text, 'til ' || e.name);
  return r;
end $$;

create or replace function app.anonymize_customer(p_tenant uuid, p_user uuid, p_customer uuid) returns integer
language plpgsql security definer set search_path = public, app as $$
declare n integer;
begin
  if app.member_role(p_tenant, p_user) is distinct from 'owner' then raise exception 'forbidden'; end if;
  update public.customers set name = 'Anonymiseret kunde', email = null, phone = null, address = null, anonymized_at = now()
  where id = p_customer and tenant_id = p_tenant;
  if not found then raise exception 'not_found'; end if;
  update public.inquiries set subject = '[Slettet]', message = '[Slettet efter anmodning]', address = null,
    draft_text = case when draft_text is null then null else '[Slettet efter anmodning]' end, version = version + 1
  where customer_id = p_customer and tenant_id = p_tenant;
  get diagnostics n = row_count;
  insert into public.audit_log (tenant_id, user_id, action, target, detail) values (p_tenant, p_user, 'anonymize', p_customer::text, n || ' sager');
  return n;
end $$;

create or replace function app.set_emergency_stop(p_user uuid, p_on boolean, p_reason text) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if not exists (select 1 from public.platform_admins where user_id = p_user) then raise exception 'forbidden'; end if;
  if p_on and coalesce(trim(p_reason), '') = '' then raise exception 'invalid'; end if;
  update public.platform_settings set emergency_stop = p_on,
    stopped_at = case when p_on then now() end, stopped_by = case when p_on then p_user end,
    reason = case when p_on then left(trim(p_reason), 300) end;
  insert into public.audit_log (tenant_id, user_id, action, detail)
    select id, p_user, case when p_on then 'emergency_stop' else 'emergency_resume' end, p_reason from public.tenants;
end $$;

-- Ejerpanel: kun aggregater – ingen navne, beskeder eller adresser.
create or replace function app.admin_tenant_overview(p_user uuid)
returns table (tenant_id uuid, tenant_name text, plan_id text, plan_price_dkk integer, paused boolean, dpa_signed boolean,
  pending_approvals bigint, open_escalations bigint, outbox_blocked bigint, worker_errors_30d bigint, ai_tokens_30d bigint)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not exists (select 1 from public.platform_admins where user_id = p_user) then raise exception 'forbidden'; end if;
  return query
  select t.id, t.name, t.plan_id, t.plan_price_dkk, t.paused, t.dpa_signed_at is not null,
    (select count(*) from public.inquiries i where i.tenant_id = t.id and i.status = 'udkast_klar'),
    (select count(*) from public.inquiries i where i.tenant_id = t.id and i.escalation_state = 'afventer_kvittering'),
    (select count(*) from public.outbox o where o.tenant_id = t.id and o.state = 'blokeret_testversion'),
    (select count(*) from public.worker_runs w where w.tenant_id = t.id and w.status = 'fejl' and w.at > now() - interval '30 days'),
    (select coalesce(sum(w.ai_tokens), 0) from public.worker_runs w where w.tenant_id = t.id and w.at > now() - interval '30 days')
  from public.tenants t order by t.name;
end $$;

-- Kun serveren må kalde skrivefunktionerne.
revoke all on all functions in schema app from public;
grant execute on function app.current_user_id(), app.is_member(uuid), app.member_role(uuid, uuid) to authenticated, service_role;
grant execute on function app.decide_reply(uuid, uuid, uuid, text, integer, text), app.decide_quote(uuid, uuid, uuid, text, integer),
  app.escalate(uuid, uuid, uuid, text), app.anonymize_customer(uuid, uuid, uuid), app.set_emergency_stop(uuid, boolean, text),
  app.admin_tenant_overview(uuid), app.automation_stopped(uuid) to service_role;
