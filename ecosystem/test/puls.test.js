'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers');

const CSV = `nummer;kunde;fakturadato;forfald;beloeb_ex_moms;betalt
1001;Café Lune;2026-09-05;2026-09-19;75.180,00;75.180,00
1002;Noon Store;2026-10-03;2026-10-17;50.000,00;0
1003;Lumi Studio;2026-10-20;2026-11-03;34.500,00;10.000,00
1004;Fejl;2026-13-40;2026-10-01;10;0`;

const OCT = { from: '2026-10-01', to: '2026-10-31' };
const SEP = { from: '2026-09-01', to: '2026-09-30' };

test('CSV-import rapporterer fejl pr. linje', () => {
  const s = setup();
  const r = s.puls.importInvoicesCsv(s.owner, CSV);
  assert.equal(r.imported, 3);
  assert.equal(r.errors.length, 0 + 1);
  assert.equal(r.errors[0].line, 5);
});

test('intet overskud uden komplette udgifter', () => {
  const s = setup();
  s.puls.importInvoicesCsv(s.owner, CSV);
  s.puls.addExpense(s.owner, { date: '2026-10-10', category: 'Vareindkøb', amount_ex_vat_ore: 2000000 });
  const sum = s.puls.summary(s.owner, OCT);
  assert.equal(sum.invoiced.ore, 8450000);
  assert.equal(sum.result.available, false);
  assert.equal(sum.result.message, 'Vi mangler data for at kunne beregne dette.');
  s.puls.setExpensesComplete(s.owner, OCT, true);
  assert.equal(s.puls.summary(s.owner, OCT).result.ore, 6450000);
});

test('sammenligning med tydelig periode', () => {
  const s = setup();
  s.puls.importInvoicesCsv(s.owner, CSV);
  const c = s.puls.compare(s.owner, OCT, SEP);
  assert.equal(c.invoicedChange.label, '+12,4 %');
  assert.equal(c.text, 'Faktureret beløb er steget 12,4 % (9.320,00 kr.) sammenlignet med perioden 2026-09-01 – 2026-09-30.');
  const empty = s.puls.compare(s.owner, OCT, { from: '2025-01-01', to: '2025-01-31' });
  assert.match(empty.text, /kan ikke beregnes/);
});

test('forfaldne fakturaer sorteret efter dage overskredet', () => {
  const s = setup();
  s.puls.importInvoicesCsv(s.owner, CSV);
  const o = s.puls.overdue(s.owner, '2026-11-08');
  assert.deepEqual(o.map((x) => [x.number, x.days_overdue, x.outstanding]), [['1002', 22, '50.000,00 kr.'], ['1003', 5, '24.500,00 kr.']]);
});
