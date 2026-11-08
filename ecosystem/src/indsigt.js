'use strict';
// INDSIGT: læser KUN data fra andre apps, når datadeling er godkendt.
// Fase 1: periodesammenligning. Forklaringer adskiller observation og mulig årsag.

const { percentChange, formatDKK } = require('./money');

function createIndsigt(platform, { puls }) {
  function revenueChange(actor, current, previous) {
    platform.require(actor, 'indsigt', 'read');
    platform.requireSharing(actor.organization_id, 'puls', 'indsigt', 'financial_kpis');
    // Læs via en systemaktør i PULS med samme organisation og kun læseret.
    const reader = platform.workerActor(actor.organization_id, 'indsigt-reader', { module: 'puls', actions: ['read'] });
    const cmp = puls.compare(reader, current, previous);
    const c = cmp.invoicedChange;
    return {
      observation: cmp.text,
      evidence: { current: cmp.current.invoiced, previous: cmp.previous.invoiced, sources: [...new Set([...cmp.current.sources, ...cmp.previous.sources])] },
      significant: c.comparable && Math.abs(c.tenthsOfPercent) >= 100, // ≥ 10 %
      possibleExplanation: null, // udfyldes kun med dokumenterede data; aldrig gæt
      uncertainty: 'Faktureret beløb er ikke modtagne betalinger. Årsager er ikke undersøgt.',
    };
  }
  return { revenueChange, formatDKK, percentChange };
}

module.exports = { createIndsigt };
