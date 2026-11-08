-- Kører mod en lokal Postgres: bevis for at tenant-isolation holder i databasen.
create role app_user nologin;
grant usage on schema public, auth to app_user;
grant select, insert, update on all tables in schema public to app_user;
grant execute on all functions in schema public, auth to app_user;

insert into organizations (id, name) values
  ('00000000-0000-0000-0000-00000000000a', 'A ApS'),
  ('00000000-0000-0000-0000-00000000000b', 'B ApS');
insert into organization_memberships values
  ('00000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'owner', '{lager,puls}'),
  ('00000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'owner', '{lager}'),
  ('00000000-0000-0000-0000-00000000000a', '33333333-3333-3333-3333-333333333333', 'member', '{lager}');
insert into organization_modules (organization_id, module, status) values
  ('00000000-0000-0000-0000-00000000000a', 'lager', 'active'),
  ('00000000-0000-0000-0000-00000000000a', 'puls', 'active'),
  ('00000000-0000-0000-0000-00000000000b', 'lager', 'active');
insert into products (organization_id, name, sku) values
  ('00000000-0000-0000-0000-00000000000a', 'A-vare', 'A1'),
  ('00000000-0000-0000-0000-00000000000b', 'B-vare', 'B1');
insert into invoices (organization_id, number, counterparty, direction, issued_on, due_on, amount_ex_vat_ore, source)
  values ('00000000-0000-0000-0000-00000000000a', '1', 'Kunde', 'receivable', '2026-10-01', '2026-10-15', 100000, 'csv');

set role app_user;

-- Ejer af A ser kun A
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert (select count(*) from products) = 1, 'A-ejer skal kun se 1 produkt';
  assert (select sku from products) = 'A1', 'A-ejer ser forkert produkt';
  assert (select count(*) from invoices) = 1, 'A-ejer skal se sin faktura';
end $$;

-- Ejer af B kan ikke se A og kan ikke indsætte i A
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  assert (select count(*) from products) = 1 and (select sku from products) = 'B1', 'B-ejer ser A-data';
  assert (select count(*) from invoices) = 0, 'B-ejer ser A-fakturaer';
  begin
    insert into products (organization_id, name, sku) values ('00000000-0000-0000-0000-00000000000a', 'Indbrud', 'X');
    raise exception 'B kunne skrive i A';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Medarbejder i A med kun LAGER kan ikke se PULS
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$ begin
  assert (select count(*) from products) = 1, 'medarbejder skal se lager';
  assert (select count(*) from invoices) = 0, 'medarbejder uden PULS ser fakturaer';
end $$;

reset role;

-- Lagerbevægelser kan ikke ændres
insert into locations (id, organization_id, name) values ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-00000000000a', 'Lager');
insert into stock_movements (organization_id, product_id, location_id, type, before, change, after, reason, actor)
  select '00000000-0000-0000-0000-00000000000a', id, '44444444-4444-4444-4444-444444444444', 'receipt', 0, 5, 5, 'test', 'test' from products where sku = 'A1';
do $$ begin
  begin update stock_movements set change = 99; raise exception 'bevægelse kunne ændres';
  exception when raise_exception then
    if sqlerrm = 'bevægelse kunne ændres' then raise; end if;
  end;
end $$;

select 'RLS-TEST OK' as resultat;
