-- Fælles database for OVERBLIK, PULS, LAGER og INDSIGT.
-- Målplatform: Supabase (Postgres, EU-region). Hver virksomhed er en tenant.
-- Tenant-isolation håndhæves i databasen med Row Level Security, ikke kun i appen.
-- Penge gemmes som bigint i øre. Aldrig float.

create extension if not exists pgcrypto;

-- auth.uid() leveres af Supabase. Lokalt: kør db/local_auth_stub.sql først.

create type app_module   as enum ('overblik', 'puls', 'lager', 'indsigt');
create type member_role  as enum ('owner', 'admin', 'member', 'viewer');
create type approval_status as enum ('pending', 'approved', 'rejected', 'executed', 'failed');
create type task_status  as enum ('not_started', 'in_progress', 'waiting', 'done', 'cancelled');
create type movement_type as enum ('receipt','sale','reservation','return','damaged','adjustment','count','transfer_out','transfer_in');

-- ---------- Platform ----------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text,
  created_at timestamptz not null default now()
);

create table organization_memberships (
  organization_id uuid not null references organizations on delete cascade,
  user_id uuid not null,
  role member_role not null,
  modules app_module[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table organization_modules (
  organization_id uuid not null references organizations on delete cascade,
  module app_module not null,
  status text not null check (status in ('trial', 'active', 'inactive')),
  stripe_subscription_item_id text,
  activated_at timestamptz not null default now(),
  primary key (organization_id, module)
);

create table data_sharing_permissions (
  organization_id uuid not null references organizations on delete cascade,
  from_module app_module not null,
  to_module app_module not null,
  scope text not null,
  consent_text text not null,          -- præcis den tekst brugeren godkendte
  granted_by uuid not null,
  granted_at timestamptz not null default now(),
  primary key (organization_id, from_module, to_module, scope)
);

create table integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  provider text not null check (provider in ('shopify','dinero','economic','csv')),
  status text not null default 'pending',
  scopes text[] not null default '{}',
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
-- Tokens ligger IKKE her. De gemmes krypteret (Supabase Vault) og læses kun af server-side jobs.

create table audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references organizations on delete cascade,
  actor text not null,
  actor_type text not null check (actor_type in ('user','ai_worker','system')),
  action text not null,
  entity text,
  details jsonb not null default '{}',
  at timestamptz not null default now()
);

create table ai_worker_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  worker text not null,
  module app_module not null,
  input_summary jsonb not null default '{}',
  output jsonb not null default '{}',
  model text,                          -- null = deterministisk regel, ingen sprogmodel
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  module app_module not null,
  kind text not null,
  title text not null,
  change text not null,
  reason text not null,
  evidence text not null,
  effect text not null,
  uncertainty text,
  payload jsonb not null default '{}',
  proposed_by text not null,
  proposed_by_type text not null,
  status approval_status not null default 'pending',
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  user_id uuid,
  module app_module,
  title text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- OVERBLIK ----------
create table customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  name text not null, company text, email text, phone text, notes text,
  owner_id uuid,
  created_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  title text not null,
  description text not null default '',
  assignee_id uuid,
  customer_id uuid references customers on delete set null,
  parent_id uuid references tasks on delete cascade,
  due_on date,
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  status task_status not null default 'not_started',
  draft boolean not null default false,
  origin text not null default 'manual',
  approval_id uuid references approval_requests on delete set null,
  recurrence_rule text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- PULS ----------
create table invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  number text not null,
  counterparty text not null,
  direction text not null check (direction in ('receivable','payable')),
  issued_on date not null,
  due_on date not null,
  amount_ex_vat_ore bigint not null,
  vat_ore bigint,
  paid_ore bigint not null default 0,
  source text not null,
  source_ref text,
  unique (organization_id, source, number)
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  date date not null,
  category text not null,
  amount_ex_vat_ore bigint not null,
  source text not null
);

create table budgets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  month date not null,
  category text not null,
  kind text not null check (kind in ('income','expense')),
  amount_ex_vat_ore bigint not null,
  unique (organization_id, month, category, kind)
);

-- ---------- LAGER ----------
create table suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  name text not null, email text, lead_time_days int, min_order_ore bigint
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  name text not null
);

create table products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  name text not null,
  sku text not null,
  barcode text,
  category text,
  supplier_id uuid references suppliers on delete set null,
  cost_ore bigint,
  price_ore bigint,
  min_stock int not null default 0,
  lead_time_days int,
  status text not null default 'active',
  source_of_truth text not null default 'lager' check (source_of_truth in ('lager','shopify')),
  external_id text,
  unique (organization_id, sku)
);

create table stock_movements (
  id bigint generated always as identity primary key,
  organization_id uuid not null references organizations on delete cascade,
  product_id uuid not null references products on delete restrict,
  location_id uuid not null references locations on delete restrict,
  type movement_type not null,
  before int not null,
  change int not null,
  after int not null check (after = before + change),
  reason text not null check (length(reason) > 0),
  reference text,
  source text not null default 'manual',
  idempotency_key text,
  actor text not null,
  occurred_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);
create index on stock_movements (organization_id, product_id, location_id, id desc);

-- Lagerbevægelser må aldrig ændres eller slettes. Rettelser er nye bevægelser.
create function forbid_change() returns trigger language plpgsql as $$
begin raise exception 'Lagerbevægelser kan ikke ændres eller slettes'; end $$;
create trigger stock_movements_immutable before update or delete on stock_movements
  for each row execute function forbid_change();
create trigger audit_logs_immutable before update or delete on audit_logs
  for each row execute function forbid_change();

create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  supplier_id uuid references suppliers on delete set null,
  status text not null default 'draft' check (status in ('draft','approved','sent','received','cancelled')),
  lines jsonb not null,
  approval_id uuid references approval_requests,
  created_at timestamptz not null default now()
);

-- ---------- Adgangsfunktioner ----------
create function has_module_access(org uuid, m app_module, min_role member_role default 'viewer')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from organization_memberships om
    join organization_modules mo on mo.organization_id = om.organization_id and mo.module = m and mo.status in ('trial','active')
    where om.organization_id = org
      and om.user_id = auth.uid()
      and m = any(om.modules)
      and (case om.role when 'owner' then 4 when 'admin' then 3 when 'member' then 2 else 1 end)
       >= (case min_role when 'owner' then 4 when 'admin' then 3 when 'member' then 2 else 1 end)
  );
$$;

create function is_member(org uuid, min_role member_role default 'viewer')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_memberships om
    where om.organization_id = org and om.user_id = auth.uid()
      and (case om.role when 'owner' then 4 when 'admin' then 3 when 'member' then 2 else 1 end)
       >= (case min_role when 'owner' then 4 when 'admin' then 3 when 'member' then 2 else 1 end)
  );
$$;

-- ---------- Row Level Security ----------
alter table organizations enable row level security;
create policy org_read on organizations for select using (is_member(id));
create policy org_update on organizations for update using (is_member(id, 'owner'));

alter table organization_memberships enable row level security;
create policy mem_read on organization_memberships for select using (is_member(organization_id));
create policy mem_write on organization_memberships for all using (is_member(organization_id, 'owner')) with check (is_member(organization_id, 'owner'));

alter table organization_modules enable row level security;
create policy mod_read on organization_modules for select using (is_member(organization_id));
-- Aktivering/betaling skrives kun server-side (Stripe-webhook med service role).

alter table data_sharing_permissions enable row level security;
create policy share_read on data_sharing_permissions for select using (is_member(organization_id));
create policy share_write on data_sharing_permissions for all using (is_member(organization_id, 'owner')) with check (is_member(organization_id, 'owner'));

alter table integrations enable row level security;
create policy int_read on integrations for select using (is_member(organization_id, 'admin'));

alter table audit_logs enable row level security;
create policy audit_read on audit_logs for select using (is_member(organization_id, 'admin'));

alter table ai_worker_runs enable row level security;
create policy runs_read on ai_worker_runs for select using (has_module_access(organization_id, module));

alter table approval_requests enable row level security;
create policy apr_read on approval_requests for select using (has_module_access(organization_id, module));
-- Beslutninger går via en server-funktion, der også udfører handlingen og logger.

alter table notifications enable row level security;
create policy notif_read on notifications for select using (is_member(organization_id) and (user_id is null or user_id = auth.uid()));

-- Moduldata: læs = viewer, skriv = member, pr. app.
do $$
declare t record;
begin
  for t in select * from (values
    ('customers','overblik'),('tasks','overblik'),
    ('invoices','puls'),('expenses','puls'),('budgets','puls'),
    ('suppliers','lager'),('locations','lager'),('products','lager'),('purchase_orders','lager')
  ) as v(tbl, m) loop
    execute format('alter table %I enable row level security', t.tbl);
    execute format('create policy %I on %I for select using (has_module_access(organization_id, %L))', t.tbl||'_read', t.tbl, t.m);
    execute format('create policy %I on %I for insert with check (has_module_access(organization_id, %L, ''member''))', t.tbl||'_ins', t.tbl, t.m);
    execute format('create policy %I on %I for update using (has_module_access(organization_id, %L, ''member'')) with check (has_module_access(organization_id, %L, ''member''))', t.tbl||'_upd', t.tbl, t.m, t.m);
  end loop;
end $$;

alter table stock_movements enable row level security;
create policy sm_read on stock_movements for select using (has_module_access(organization_id, 'lager'));
create policy sm_ins on stock_movements for insert with check (has_module_access(organization_id, 'lager', 'member'));
