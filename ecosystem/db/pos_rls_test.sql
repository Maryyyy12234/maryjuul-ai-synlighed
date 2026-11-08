-- Kør efter rls_test.sql (bruger samme testvirksomheder og rolle).
reset role;
grant select, insert, update on all tables in schema public to app_user;
insert into pos_connections (id, organization_id, provider, account, status) values
  ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-00000000000a', 'shopify', 'a.myshopify.com', 'connected');
insert into pos_connection_credentials (connection_id, organization_id, sealed) values
  ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-00000000000a', 'v1.hemmelig');
insert into pos_orders (organization_id, connection_id, external_id, channel, processed_at, source_updated_at, currency, taxes_included,
  subtotal_ore, discounts_ore, tax_ore, total_ore, current_subtotal_ore, current_discounts_ore, current_tax_ore, current_total_ore, content_hash)
  values ('00000000-0000-0000-0000-00000000000a', '55555555-5555-5555-5555-555555555555', 'gid://shopify/Order/1', 'pos', now(), now(), 'DKK', true,
  49900, 0, 9980, 49900, 49900, 0, 9980, 49900, 'x');

set role app_user;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';  -- ejer af A
do $$ begin
  assert (select count(*) from pos_connections) = 1, 'A-ejer skal se sin forbindelse';
  assert (select count(*) from pos_orders) = 1, 'A-ejer skal se sine ordrer';
  assert (select count(*) from pos_connection_credentials) = 0, 'tokens må ALDRIG kunne læses af klienter';
  assert (select count(*) from pos_webhook_events) = 0, 'webhook-kø må ikke kunne læses af klienter';
  begin
    insert into pos_orders (organization_id, connection_id, external_id, channel, processed_at, source_updated_at, currency, taxes_included,
      subtotal_ore, discounts_ore, tax_ore, total_ore, current_subtotal_ore, current_discounts_ore, current_tax_ore, current_total_ore, content_hash)
      values ('00000000-0000-0000-0000-00000000000a', '55555555-5555-5555-5555-555555555555', 'falsk', 'pos', now(), now(), 'DKK', true, 1,0,0,1,1,0,0,1,'x');
    raise exception 'klient kunne skrive en falsk ordre';
  exception when insufficient_privilege then null;
  end;
end $$;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';  -- ejer af B
do $$ begin
  assert (select count(*) from pos_connections) = 0, 'B ser A''s forbindelse';
  assert (select count(*) from pos_orders) = 0, 'B ser A''s kassedata';
end $$;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';  -- medarbejder i A (kun LAGER)
do $$ begin
  assert (select count(*) from pos_connections) = 0, 'medarbejder må ikke se forbindelsesopsætning';
end $$;
reset role;
select 'POS-RLS-TEST OK' as resultat;
