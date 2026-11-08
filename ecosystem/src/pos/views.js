'use strict';
// Læsemodeller oven på kassedata til PULS og INDSIGT. Ingen kopier: beregnes
// fra POS-motorens normaliserede data. Alle tal beregnes i kode og er
// grupperet pr. valuta (forskellige valutaer lægges aldrig sammen).

const { percentChange, formatDKK } = require('../money');

const NO_DATA = 'Ingen kassedata i perioden.';
const SIZE_OPTION = /^(size|størrelse|str\.?)$/i;

function localDate(isoStr, tz) {
  // YYYY-MM-DD i butikkens tidszone
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(isoStr));
}
const fmt = (ore, cur) => (cur === 'DKK' ? formatDKK(ore) : `${(ore / 100).toFixed(2).replace('.', ',')} ${cur}`);

function createPosViews(platform, engine) {
  function scoped(actor, app, period) {
    platform.require(actor, app, 'read');
    const d = engine.dataFor(actor.organization_id, app);
    const tzOf = new Map(d.connections.map((c) => [c.id, c.timezone]));
    const inPeriod = (o) => { const day = localDate(o.processed_at, tzOf.get(o.connection_id)); return day >= period.from && day <= period.to; };
    return { ...d, tzOf, orders: d.orders.filter((o) => !o.test && inPeriod(o)) };
  }

  function exVat(o) { return o.taxes_included ? o.totals.currentSubtotalOre - o.totals.currentTaxOre : o.totals.currentSubtotalOre; }

  // ---------- PULS: registreret salg fra kassen ----------
  function salesSummary(actor, period) {
    const d = scoped(actor, 'puls', period);
    const groups = new Map();
    for (const o of d.orders) {
      const g = groups.get(o.currency) || { currency: o.currency, orders: 0, cancelled: 0, salesExVatOre: 0, vatOre: 0, discountsOre: 0, refundedOre: 0, posOrders: 0, onlineOrders: 0, taxesIncludedMixed: new Set() };
      if (o.cancelled_at) { g.cancelled++; groups.set(o.currency, g); continue; }
      g.orders++; o.channel === 'pos' ? g.posOrders++ : g.onlineOrders++;
      g.salesExVatOre += exVat(o); g.vatOre += o.totals.currentTaxOre; g.discountsOre += o.totals.currentDiscountsOre;
      g.taxesIncludedMixed.add(o.taxes_included);
      groups.set(o.currency, g);
    }
    // Refusioner opgøres efter refusionsdato
    for (const o of scoped(actor, 'puls', { from: '0000-01-01', to: '9999-12-31' }).orders) {
      for (const r of o.refunds) {
        const day = localDate(r.processedAt, d.tzOf.get(o.connection_id));
        if (day < period.from || day > period.to) continue;
        const g = groups.get(o.currency) || { currency: o.currency, orders: 0, cancelled: 0, salesExVatOre: 0, vatOre: 0, discountsOre: 0, refundedOre: 0, posOrders: 0, onlineOrders: 0, taxesIncludedMixed: new Set() };
        g.refundedOre += r.totalOre; groups.set(o.currency, g);
      }
    }
    return {
      period, available: groups.size > 0, message: groups.size ? null : NO_DATA,
      kind: 'kassedata',
      definition: 'Registreret salg fra kassesystemet efter rabatter og returer, ekskl. moms. Det er IKKE modtagne betalinger, bankindestående eller bogført omsætning.',
      sources: d.connections.map((c) => ({ provider: c.provider, account: c.account, demo: c.demo, historical: c.historical })),
      byCurrency: [...groups.values()].map(({ taxesIncludedMixed, ...g }) => ({
        ...g, labels: { salesExVat: fmt(g.salesExVatOre, g.currency), vat: fmt(g.vatOre, g.currency), discounts: fmt(g.discountsOre, g.currency), refunded: fmt(g.refundedOre, g.currency) },
        notes: ['Moms er Shopifys registrerede momslinjer.', 'Refunderet er opgjort efter refusionsdato og er allerede trukket fra salget på den oprindelige ordre.'],
      })),
    };
  }

  function salesComparison(actor, current, previous) {
    const a = salesSummary(actor, current), b = salesSummary(actor, previous);
    return { current: a, previous: b, byCurrency: a.byCurrency.map((g) => {
      const p = b.byCurrency.find((x) => x.currency === g.currency);
      const ch = percentChange(g.salesExVatOre, p ? p.salesExVatOre : 0);
      return { currency: g.currency, change: ch,
        text: ch.comparable
          ? `Registreret salg er ${ch.diff >= 0 ? 'steget' : 'faldet'} ${ch.label.replace(/^[+-]/, '')} (${fmt(Math.abs(ch.diff), g.currency)}) sammenlignet med ${previous.from} – ${previous.to}.`
          : `Registreret salg: ${fmt(g.salesExVatOre, g.currency)}. ${ch.reason}` };
    }) };
  }

  // ---------- INDSIGT: analyse ----------
  function lineNetExVat(o, l) {
    if (!l.currentQuantity) return 0;
    const gross = l.netUnitPriceOre * l.currentQuantity;
    const tax = l.quantity ? Math.round((l.taxOre * l.currentQuantity) / l.quantity) : 0;
    return o.taxes_included ? gross - tax : gross;
  }

  function analysis(actor, period) {
    const d = scoped(actor, 'indsigt', period);
    const live = d.orders.filter((o) => !o.cancelled_at);
    if (!live.length) return { period, available: false, message: NO_DATA };
    const byCur = new Map();
    const bucket = (m, key, init) => { if (!m.has(key)) m.set(key, init()); return m.get(key); };
    for (const o of live) {
      const g = bucket(byCur, o.currency, () => ({ currency: o.currency, orders: 0, netOre: 0, units: 0, products: new Map(), sizes: new Map(), categories: new Map(), locations: new Map(), days: new Map(), months: new Map(), sizeData: false }));
      const net = exVat(o);
      g.orders++; g.netOre += net;
      const day = localDate(o.processed_at, d.tzOf.get(o.connection_id));
      const dd = bucket(g.days, day, () => ({ key: day, orders: 0, netOre: 0 })); dd.orders++; dd.netOre += net;
      const mm = bucket(g.months, day.slice(0, 7), () => ({ key: day.slice(0, 7), orders: 0, netOre: 0 })); mm.orders++; mm.netOre += net;
      const locName = o.location_external_id ? (d.locations.get(`${o.connection_id}|${o.location_external_id}`)?.name || 'Ukendt butik') : 'Webshop';
      const ll = bucket(g.locations, locName, () => ({ key: locName, orders: 0, netOre: 0 })); ll.orders++; ll.netOre += net;
      for (const l of o.lines) {
        if (!l.currentQuantity) continue;
        const v = d.variants.get(`${o.connection_id}|${l.variantExternalId}`);
        const pKey = l.productExternalId || l.title;
        const lineNet = lineNetExVat(o, l);
        g.units += l.currentQuantity;
        const pr = bucket(g.products, pKey, () => ({ key: pKey, title: l.title, units: 0, netOre: 0 })); pr.units += l.currentQuantity; pr.netOre += lineNet;
        const cat = l.category || 'Uden kategori';
        const cc = bucket(g.categories, cat, () => ({ key: cat, units: 0, netOre: 0 })); cc.units += l.currentQuantity; cc.netOre += lineNet;
        const size = v?.options?.find((x) => SIZE_OPTION.test(x.name))?.value;
        if (size) { g.sizeData = true; const ss = bucket(g.sizes, size, () => ({ key: size, units: 0, netOre: 0 })); ss.units += l.currentQuantity; ss.netOre += lineNet; }
      }
    }
    const sorted = (m, by = 'netOre') => [...m.values()].sort((a, b) => b[by] - a[by] || String(a.key).localeCompare(String(b.key)));
    return { period, available: true,
      definition: 'Beregnet af kassedata efter rabatter og returer, ekskl. moms. Annullerede ordrer og testordrer er udeladt.',
      sources: d.connections.map((c) => ({ provider: c.provider, account: c.account, demo: c.demo, historical: c.historical })),
      byCurrency: [...byCur.values()].map((g) => ({
        currency: g.currency, orders: g.orders, units: g.units, netOre: g.netOre, net: fmt(g.netOre, g.currency),
        aovOre: Math.round(g.netOre / g.orders), aov: fmt(Math.round(g.netOre / g.orders), g.currency),
        topProducts: sorted(g.products, 'units').slice(0, 10),
        bySize: g.sizeData ? sorted(g.sizes, 'units') : null,
        bySizeNote: g.sizeData ? null : 'Varerne har ingen størrelsesvariant i kassesystemet.',
        byCategory: sorted(g.categories), byLocation: sorted(g.locations),
        byDay: [...g.days.values()].sort((a, b) => a.key.localeCompare(b.key)),
        byMonth: [...g.months.values()].sort((a, b) => a.key.localeCompare(b.key)),
      })),
    };
  }

  function compare(actor, current, previous) {
    const a = analysis(actor, current), b = analysis(actor, previous);
    if (!a.available) return { available: false, message: a.message, current: a, previous: b };
    return { available: true, current: a, previous: b, byCurrency: a.byCurrency.map((g) => {
      const p = b.available ? b.byCurrency.find((x) => x.currency === g.currency) : null;
      const pc = (x, y) => percentChange(x, y || 0);
      const cats = g.byCategory.map((c) => {
        const pcat = p?.byCategory.find((x) => x.key === c.key);
        return { key: c.key, netOre: c.netOre, prevNetOre: pcat?.netOre || 0, units: c.units, prevUnits: pcat?.units || 0, change: pc(c.netOre, pcat?.netOre) };
      });
      for (const pcat of p?.byCategory || []) if (!cats.find((x) => x.key === pcat.key)) cats.push({ key: pcat.key, netOre: 0, prevNetOre: pcat.netOre, units: 0, prevUnits: pcat.units, change: pc(0, pcat.netOre) });
      return { currency: g.currency, comparedWith: previous,
        net: pc(g.netOre, p?.netOre), orders: pc(g.orders * 100, (p?.orders || 0) * 100), aov: pc(g.aovOre, p?.aovOre),
        current: { netOre: g.netOre, orders: g.orders, aovOre: g.aovOre }, previous: p ? { netOre: p.netOre, orders: p.orders, aovOre: p.aovOre } : null,
        categories: cats };
    }) };
  }

  return { salesSummary, salesComparison, analysis, compare, localDate, fmt };
}

module.exports = { createPosViews, localDate };
