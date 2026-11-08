-- Betalinger og kortterminaler. Kører efter schema.sql og pos_schema.sql.
-- INGEN kortdata: ingen kortnumre (heller ikke maskerede), CVV/CVC, PIN, magnetstribe- eller chipdata.
-- Kun reference, type, status, beløb, valuta, tidspunkt, kortets brand, terminal og forretningsnummer.
-- Klienter kan kun læse via RLS. Al skrivning sker server-side (synk og filimport).

create table payment_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  provider text not null check (provider in ('nets','sumup','zettle','verifone','worldline')),
  kind text not null check (kind in ('api','file')),
  status text not null check (status in ('connected','syncing','requires_action','error','disconnected','manual')),
  label text, targets jsonb not null default '{"puls":true,"indsigt":true,"overblik":true}',
  timezone text not null default 'Europe/Copenhagen', payout_lag_days int not null default 3 check (payout_lag_days between 0 and 30),
  sync_cursor timestamptz, coverage_until timestamptz, last_sync_at timestamptz, last_success_at timestamptz, last_error text,
  demo boolean not null default false, created_at timestamptz not null default now(), disconnected_at timestamptz, data_deleted_at timestamptz
);
create table payment_connection_credentials (                -- RLS uden policies = ingen klientadgang
  connection_id uuid primary key references payment_connections on delete cascade,
  organization_id uuid not null references organizations on delete cascade,
  sealed text not null, rotated_at timestamptz not null default now()
);
create table merchant_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  connection_id uuid not null references payment_connections on delete cascade,
  external_id text not null, name text, unique (connection_id, external_id)
);
create table payment_terminals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  connection_id uuid not null references payment_connections on delete cascade,
  external_id text not null, name text, pos_location_external_id text, unique (connection_id, external_id)
);
create table payment_transactions (                          -- PaymentTransaction, PaymentRefund og PaymentDispute adskilles via type
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  connection_id uuid not null references payment_connections on delete cascade,
  type text not null check (type in ('payment','refund','chargeback')),
  external_ref text not null, provider_id text,
  status text not null check (status in ('successful','pending','failed','cancelled','refunded','chargeback','unknown')),
  amount_ore bigint not null check (amount_ore >= 0), refunded_ore bigint not null default 0, currency char(3) not null,
  occurred_at timestamptz not null, time_known boolean not null default true,
  channel text, card_scheme text check (card_scheme is null or card_scheme ~ '^[A-Z_]{2,20}$'),   -- kun brand, aldrig kortnummer
  terminal_external_id text, merchant_account text,
  payout_id uuid, payout_date date,
  source text not null, content_hash text not null, first_seen_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (connection_id, type, external_ref)
);
create index on payment_transactions (organization_id, occurred_at);
create table payment_payout_records (                        -- PaymentSettlement: én linje pr. betaling/fradrag i en udbetaling
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  connection_id uuid not null references payment_connections on delete cascade,
  record_id text not null, type text not null, amount_ore bigint not null, fee_ore bigint not null default 0, currency char(3) not null,
  date date not null, status text not null, reference text, transaction_ref text, unique (connection_id, record_id)
);
create table payment_payouts (                               -- PaymentPayout: bundtet udbetaling
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  connection_id uuid not null references payment_connections on delete cascade,
  reference text, date date not null, currency char(3) not null,
  gross_ore bigint not null, fees_ore bigint not null, deductions_ore bigint not null, net_ore bigint not null,
  unique (connection_id, reference, date, currency)
);
create table payment_fees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  connection_id uuid not null references payment_connections on delete cascade,
  transaction_ref text, payout_id uuid references payment_payouts on delete cascade, amount_ore bigint not null, currency char(3) not null, date date not null, source text not null
);
create table payment_reconciliations (                       -- kun MENNESKERS beslutninger; selve afstemningen beregnes
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  pos_payment_key text, transaction_key text, item_key text,
  decision text not null check (decision in ('confirmed','rejected','resolved')),
  note text, decided_by uuid not null, decided_at timestamptz not null default now()
);
create table payment_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  connection_id uuid not null references payment_connections on delete cascade,
  mode text not null, status text not null, counts jsonb not null default '{}', errors jsonb not null default '[]',
  started_at timestamptz not null default now(), finished_at timestamptz
);
create table payment_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  connection_id uuid not null references payment_connections on delete cascade,
  file_name text, file_hash text not null, status text not null check (status in ('preview','imported','cancelled')),
  mapping jsonb not null, row_count int, valid_count int, error_count int, counts jsonb, errors jsonb,  -- fejl gemmer linjenr. + besked, aldrig rå række
  created_by uuid not null, created_at timestamptz not null default now(), finished_at timestamptz
);

alter table payment_connection_credentials enable row level security;
alter table payment_connections enable row level security;
create policy payc_read on payment_connections for select using (is_member(organization_id, 'admin'));
alter table payment_sync_runs enable row level security;
create policy paysr_read on payment_sync_runs for select using (is_member(organization_id, 'admin'));
alter table payment_imports enable row level security;
create policy payi_read on payment_imports for select using (is_member(organization_id, 'admin'));
do $$
declare t text;
begin
  foreach t in array array['merchant_accounts','payment_terminals','payment_transactions','payment_payout_records','payment_payouts','payment_fees','payment_reconciliations'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy %I on %I for select using (has_module_access(organization_id, 'puls') or has_module_access(organization_id, 'indsigt'))$p$, t || '_read', t);
  end loop;
end $$;
