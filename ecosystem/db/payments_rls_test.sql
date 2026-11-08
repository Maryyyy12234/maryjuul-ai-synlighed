reset role;
grant select, insert, update on all tables in schema public to app_user;
insert into payment_connections (id, organization_id, provider, kind, status) values ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-00000000000a', 'sumup', 'api', 'connected');
insert into payment_connection_credentials values ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-00000000000a', 'v1.hemmelig', now());
insert into payment_transactions (organization_id, connection_id, type, external_ref, status, amount_ore, currency, occurred_at, source, content_hash)
  values ('00000000-0000-0000-0000-00000000000a', '66666666-6666-6666-6666-666666666666', 'payment', 'T1', 'successful', 89900, 'DKK', now(), 'api', 'x');
do $$ begin
  begin
    insert into payment_transactions (organization_id, connection_id, type, external_ref, status, amount_ore, currency, occurred_at, source, content_hash, card_scheme)
      values ('00000000-0000-0000-0000-00000000000a', '66666666-6666-6666-6666-666666666666', 'payment', 'T2', 'successful', 1, 'DKK', now(), 'api', 'x', '4111111111111111');
    raise exception 'kortnummer kunne gemmes i card_scheme';
  exception when check_violation then null;
  end;
  begin
    insert into payment_transactions (organization_id, connection_id, type, external_ref, status, amount_ore, currency, occurred_at, source, content_hash)
      values ('00000000-0000-0000-0000-00000000000a', '66666666-6666-6666-6666-666666666666', 'payment', 'T1', 'successful', 89900, 'DKK', now(), 'api', 'x');
    raise exception 'dublet kunne gemmes';
  exception when unique_violation then null;
  end;
end $$;
set role app_user;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert (select count(*) from payment_transactions) = 1, 'A-ejer skal se sine betalinger';
  assert (select count(*) from payment_connection_credentials) = 0, 'tokens må aldrig kunne læses';
  begin
    insert into payment_transactions (organization_id, connection_id, type, external_ref, status, amount_ore, currency, occurred_at, source, content_hash)
      values ('00000000-0000-0000-0000-00000000000a', '66666666-6666-6666-6666-666666666666', 'payment', 'FALSK', 'successful', 1, 'DKK', now(), 'api', 'x');
    raise exception 'klient kunne skrive en betaling';
  exception when insufficient_privilege then null;
  end;
end $$;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin assert (select count(*) from payment_transactions) = 0, 'B ser A''s betalinger'; assert (select count(*) from payment_connections) = 0, 'B ser A''s forbindelse'; end $$;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';  -- medarbejder med kun LAGER
do $$ begin assert (select count(*) from payment_transactions) = 0, 'LAGER-medarbejder ser betalinger'; end $$;
reset role;
select 'BETALINGS-RLS-TEST OK' as resultat;
