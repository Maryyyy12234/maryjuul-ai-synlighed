-- POS-integration (kassesystemer). Kører efter db/schema.sql.
-- Én normaliseret kopi af kassedata pr. organisation. Apps læser via
-- serverens læsemodeller, som også tjekker ejerens valg af datadeling.
-- Klienter (browser) kan KUN læse via RLS og kan aldrig skrive: al skrivning
-- sker server-side med service role fra synkroniserings-jobs.

create table pos_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  provider text not null check (provider in ('shopify','zettle','lightspeed','shopbox','csv')),
  account text not null,                         -- fx dinbutik.myshopify.com
  status text not null check (status in ('connecting','connected','syncing','requires_action','error','disconnected')),
  scopes text[] not null default '{}',
  targets jsonb not null default '{"lager":true,"puls":true,"indsigt":true,"overblik":true}',
  defaults jsonb not null default '{"min_stock":2,"lead_time_days":null}',
  shop_name text, timezone text, currency char(3),
  sync_cursor timestamptz,
  last_sync_at timestamptz, last_success_at timestamptz, last_error text,
  demo boolean not null default false,
  connected_by uuid, connected_at timestamptz, disconnected_at timestamptz, data_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, provider, account)
);

-- Krypterede tokens. RLS slået til UDEN policies = ingen klientadgang overhovedet.
-- I Supabase: læg hellere selve hemmeligheden i Vault og gem kun vault-id her.
create table pos_connection_credentials (
  connection_id uuid primary key references pos_connections on delete cascade,
  organization_id uuid not null references organizations on delete cascade,
  sealed text not null,                          -- AES-256-GCM, nøgle uden for databasen
  rotated_at timestamptz not null default now()
);

create table pos_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  connection_id uuid not null references pos_connections on delete cascade,
  external_id text not null, name text not null, active boolean not null default true,
  lager_location_id uuid references locations on delete set null,
  unique (connection_id, external_id)
);

create table pos_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  connection_id uuid not null references pos_connections on delete cascade,
  external_id text not null, title text not null, category text, vendor text, status text,
  source_updated_at timestamptz, deleted boolean not null default false,
  unique (connection_id, external_id)
);

create table pos_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  connection_id uuid not null references pos_connections on delete cascade,
  product_id uuid not null references pos_products on delete cascade,
  external_id text not null, inventory_item_id text, tracked boolean not null default true,
  title text, sku text, price_ore bigint, cost_ore bigint, options jsonb not null default '[]',
  lager_product_id uuid references products on delete set null,
  unique (connection_id, external_id)
);
create index on pos_variants (connection_id, inventory_item_id);

create table pos_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  connection_id uuid not null references pos_connections on delete cascade,
  external_id text not null, name text,
  channel text not null check (channel in ('pos','online')),
  location_external_id text,
  processed_at timestamptz not null, source_created_at timestamptz, source_updated_at timestamptz not null, cancelled_at timestamptz,
  test boolean not null default false,
  currency char(3) not null, taxes_included boolean not null,
  payment_status text,                           -- POSPaymentSummary: kun status, aldrig kortdata
  subtotal_ore bigint not null, discounts_ore bigint not null, tax_ore bigint not null, total_ore bigint not null,
  current_subtotal_ore bigint not null, current_discounts_ore bigint not null, current_tax_ore bigint not null, current_total_ore bigint not null,
  refunded_ore bigint not null default 0,
  content_hash text not null,                    -- ændringsdetektion ved samme tidsstempel
  unique (connection_id, external_id)
);
create index on pos_orders (organization_id, processed_at);

create table pos_order_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  order_id uuid not null references pos_orders on delete cascade,
  external_id text not null, variant_external_id text, product_external_id text, category text, sku text, title text, variant_title text,
  quantity int not null, current_quantity int not null,
  unit_price_ore bigint not null, net_unit_price_ore bigint not null, discount_ore bigint not null, tax_ore bigint not null, tax_rate_pct numeric(5,2),
  unique (order_id, external_id)
);

create table pos_refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  order_id uuid not null references pos_orders on delete cascade,
  external_id text not null, processed_at timestamptz not null, total_ore bigint not null, note text,
  lines jsonb not null default '[]',             -- [{lineExternalId, quantity, restockType, subtotalOre, taxOre}]
  unique (order_id, external_id)
);

create table pos_inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  connection_id uuid not null references pos_connections on delete cascade,
  inventory_item_id text not null, location_external_id text not null,
  available int, on_hand int, committed int, source_updated_at timestamptz not null,
  unique (connection_id, inventory_item_id, location_external_id)
);

create table pos_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  connection_id uuid not null references pos_connections on delete cascade,
  mode text not null check (mode in ('initial','incremental','reconcile')),
  status text not null check (status in ('running','succeeded','partial','failed')),
  counts jsonb not null default '{}', errors jsonb not null default '[]', triggered_by text,
  started_at timestamptz not null default now(), finished_at timestamptz
);

-- Webhook-kø. Dubletter afvises af unik nøgle på (provider, delivery_id).
create table pos_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations on delete cascade,
  connection_id uuid references pos_connections on delete cascade,
  provider text not null, delivery_id text not null, event_id text, topic text not null, account text,
  action jsonb not null, status text not null check (status in ('queued','retry','processed','failed','ignored')),
  attempts int not null default 0, next_attempt_at timestamptz, last_error text,
  received_at timestamptz not null default now(), processed_at timestamptz,
  unique (provider, delivery_id)
);
create index on pos_webhook_events (status, next_attempt_at);

-- ---------- RLS ----------
alter table pos_connections enable row level security;
create policy posc_read on pos_connections for select using (is_member(organization_id, 'admin'));
alter table pos_sync_runs enable row level security;
create policy possr_read on pos_sync_runs for select using (is_member(organization_id, 'admin'));
alter table pos_connection_credentials enable row level security;   -- ingen policies
alter table pos_webhook_events enable row level security;           -- ingen policies

do $$
declare t text;
begin
  foreach t in array array['pos_locations','pos_products','pos_variants','pos_orders','pos_order_lines','pos_refunds','pos_inventory_snapshots'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy %I on %I for select using (
      has_module_access(organization_id, 'puls') or has_module_access(organization_id, 'indsigt') or has_module_access(organization_id, 'lager'))$p$, t || '_read', t);
  end loop;
end $$;
