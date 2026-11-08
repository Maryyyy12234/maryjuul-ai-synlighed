'use strict';
// PULS: økonomisk overblik. Læser data fra kildesystemer (CSV nu; Dinero/
// e-conomic senere). Bogfører, betaler og fakturerer IKKE.

const { sum, percentChange, formatDKK, parseDKK } = require('./money');

const MISSING = 'Vi mangler data for at kunne beregne dette.';
const DAY = 86400000;
const isDate = (v) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(v || "")) return false; const d = new Date(`${v}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v; };

function createPuls(platform) {
  const repo = (a) => platform.repo(a, 'puls');

  // CSV-import af fakturaer. Kolonner: nummer;kunde;fakturadato;forfald;beloeb_ex_moms;betalt
  function importInvoicesCsv(actor, csv, { source = 'csv' } = {}) {
    const lines = csv.trim().split(/\r?\n/);
    const head = lines.shift().split(';').map((h) => h.trim().toLowerCase());
    const need = ['nummer', 'kunde', 'fakturadato', 'forfald', 'beloeb_ex_moms', 'betalt'];
    const missing = need.filter((n) => !head.includes(n));
    if (missing.length) throw new Error(`CSV mangler kolonner: ${missing.join(', ')}`);
    const errors = []; const rows = [];
    lines.forEach((line, i) => {
      const c = Object.fromEntries(line.split(';').map((v, j) => [head[j], v.trim()]));
      try {
        if (!isDate(c.fakturadato) || !isDate(c.forfald)) throw new Error('dato skal være en gyldig ÅÅÅÅ-MM-DD');
        const amount = parseDKK(c.beloeb_ex_moms);
        const paid = parseDKK(c.betalt || '0');
        rows.push(repo(actor).insert('invoices', { number: c.nummer, counterparty: c.kunde, direction: 'receivable',
          issued_on: c.fakturadato, due_on: c.forfald, amount_ex_vat_ore: amount, paid_ore: paid, source }));
      } catch (e) { errors.push({ line: i + 2, error: e.message }); }
    });
    return { imported: rows.length, errors };
  }

  function addExpense(actor, { date, category, amount_ex_vat_ore, source = 'manual' }) {
    return repo(actor).insert('expenses', { date, category, amount_ex_vat_ore, source });
  }
  // Markér om udgifter for en periode er komplette. Uden det vises intet overskud.
  function setExpensesComplete(actor, period, complete) {
    return repo(actor).insert('period_flags', { period, expenses_complete: !!complete });
  }

  const inPeriod = (d, p) => d >= p.from && d <= p.to;

  function summary(actor, period) {
    const r = repo(actor);
    const inv = r.list('invoices', (i) => i.direction === 'receivable' && inPeriod(i.issued_on, period));
    const exp = r.list('expenses', (e) => inPeriod(e.date, period));
    const flags = r.list('period_flags', (f) => f.period.from === period.from && f.period.to === period.to);
    const complete = flags.length ? flags[flags.length - 1].expenses_complete : false;
    const invoiced = sum(inv.map((i) => i.amount_ex_vat_ore));
    const expenses = sum(exp.map((e) => e.amount_ex_vat_ore));
    return {
      period, vat: 'ekskl. moms',
      invoiced: { ore: invoiced, label: formatDKK(invoiced), definition: 'Faktureret i perioden (fakturadato). Ikke det samme som modtagne betalinger.', count: inv.length },
      expenses: { ore: expenses, label: formatDKK(expenses), definition: 'Registrerede udgifter. Kan være ufuldstændige.', complete },
      result: complete
        ? { available: true, ore: invoiced - expenses, label: formatDKK(invoiced - expenses), definition: 'Faktureret minus registrerede udgifter. Ikke et bogført regnskabsresultat.' }
        : { available: false, message: MISSING, why: 'Udgifterne for perioden er ikke markeret som komplette.' },
      sources: [...new Set([...inv, ...exp].map((x) => x.source))],
    };
  }

  function compare(actor, current, previous) {
    const a = summary(actor, current), b = summary(actor, previous);
    return { current: a, previous: b, invoicedChange: percentChange(a.invoiced.ore, b.invoiced.ore),
      text: describeChange('Faktureret beløb', a.invoiced.ore, b.invoiced.ore, previous) };
  }

  function overdue(actor, today) {
    const t = Date.parse(today);
    return repo(actor).list('invoices', (i) => i.direction === 'receivable' && i.paid_ore < i.amount_ex_vat_ore && Date.parse(i.due_on) < t)
      .map((i) => ({ id: i.id, number: i.number, counterparty: i.counterparty, due_on: i.due_on,
        outstanding_ore: i.amount_ex_vat_ore - i.paid_ore, outstanding: formatDKK(i.amount_ex_vat_ore - i.paid_ore),
        days_overdue: Math.floor((t - Date.parse(i.due_on)) / DAY), source: i.source }))
      .sort((x, y) => y.days_overdue - x.days_overdue);
  }

  return { MISSING, importInvoicesCsv, addExpense, setExpensesComplete, summary, compare, overdue };
}

function describeChange(label, cur, prev, prevPeriod) {
  const c = percentChange(cur, prev);
  const ref = `perioden ${prevPeriod.from} – ${prevPeriod.to}`;
  if (!c.comparable) return `${label}: ${formatDKK(cur)}. ${c.reason}`;
  const dir = c.diff > 0 ? 'steget' : c.diff < 0 ? 'faldet' : 'uændret';
  return `${label} er ${dir} ${c.label.replace(/^[+-]/, '')} (${formatDKK(Math.abs(c.diff))}) sammenlignet med ${ref}.`;
}

module.exports = { createPuls, describeChange, MISSING };
