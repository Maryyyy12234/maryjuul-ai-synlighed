'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../src/money');

test('parser danske og engelske beløb til øre uden float', () => {
  assert.equal(m.parseDKK('1.234,56'), 123456);
  assert.equal(m.parseDKK('1234.56'), 123456);
  assert.equal(m.parseDKK('0,1'), 10);
  assert.equal(m.parseDKK('84.500 kr.'), 8450000);
  assert.equal(m.parseDKK('-12,05'), -1205);
  assert.throws(() => m.parseDKK('12,345'));
  assert.throws(() => m.parseDKK('abc'));
});

test('0,1 + 0,2 giver præcis 0,30', () => {
  assert.equal(m.sum([m.parseDKK('0,10'), m.parseDKK('0,20')]), 30);
  assert.throws(() => m.sum([0.1]));
});

test('formatering', () => {
  assert.equal(m.formatDKK(8450000), '84.500,00 kr.');
  assert.equal(m.formatDKK(-1205), '-12,05 kr.');
});

test('procentændring – også når forrige periode er 0', () => {
  assert.equal(m.percentChange(8450000, 7518000).label, '+12,4 %');
  assert.equal(m.percentChange(9000, 10000).label, '-10,0 %');
  const zero = m.percentChange(5000, 0);
  assert.equal(zero.comparable, false);
  assert.match(zero.reason, /kan ikke beregnes/);
  assert.equal(m.percentChange(100, -50).comparable, false);
});

test('moms 25 %', () => {
  assert.deepEqual(m.splitVat(12500), { gross: 12500, net: 10000, vat: 2500 });
  const s = m.splitVat(9999);
  assert.equal(s.net + s.vat, 9999);
});
