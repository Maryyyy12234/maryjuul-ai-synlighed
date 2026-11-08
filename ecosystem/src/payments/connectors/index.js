'use strict';
// Register over betalingsudbydere. Status er ÆGTE:
// - available: kan forbindes nu (API)       -> knap "Forbind"
// - file: kan bruges via filimport          -> knap "Manuel import"
// - needs_setup: bygget, men serveren mangler nøgler
// - planned: integration under udvikling   -> ingen knap
const { createSumUpConnector } = require('./sumup');

const PROVIDERS = [
  { id: 'nets', name: 'Nets / Nexi (Dankort)', kind: 'file', status: 'file',
    description: 'Dankort og internationale kort via Nets-indløsning. Import af transaktions- og afregningsrapporter fra MyNets (CSV).',
    data: ['Transaktioner', 'Refunderinger', 'Gebyrer', 'Afregninger'],
    research: 'MyNets kan eksportere rapporter som CSV, XLS/XLSX og XML, og Nets tilbyder SFTP-levering af afregningsfiler. Kolonnernes præcise navne er ikke offentligt dokumenteret – derfor vælger du selv kolonnerne ved første import. Direkte API kræver aftale med Nexi.',
    next: 'Få en rigtig MyNets-eksport fra en kunde og gem den som fast skabelon. Undersøg SFTP-aftale med Nexi.',
    docs: 'https://support.nets.eu/article/settlement-report-tutorial' },
  { id: 'zettle', name: 'PayPal POS (Zettle)', kind: 'api', status: 'planned',
    description: 'Finance API med transaktioner, gebyrer (PAYMENT_FEE) og udbetalinger. OAuth med READ:FINANCE.',
    data: ['Transaktioner', 'Gebyrer', 'Udbetalinger'], research: 'Officielt Finance API v2 (finance.izettle.com/v2). Kræver app-registrering hos Zettle.', next: 'Byg connector efter SumUp-mønstret.', docs: 'https://github.com/iZettle/api-documentation/tree/master/finance-api' },
  { id: 'verifone', name: 'Verifone', kind: 'api', status: 'planned',
    description: 'Verifone Central har rapporter (CSV) og et Reporting API.', data: [], research: 'Dokumentationen er regionsopdelt. Nordisk adgang og aftalekrav er ikke bekræftet.', next: 'Kontakt Verifone Norden om Reporting API-adgang for danske forhandlere.', docs: 'https://verifone.cloud/docs/portal/reports/generated-reports' },
  { id: 'worldline', name: 'Worldline', kind: 'api', status: 'planned',
    description: 'Worldline har rapporterings-API\'er for transaktioner, gebyrer og afregning.', data: [], research: 'Der findes flere Worldline-platforme (Nordamerika og europæisk indløsning). Hvilken danske butikker bruger, er ikke afklaret.', next: 'Afklar platform og partnerkrav med Worldline.', docs: 'https://financial-services.developer.worldline.com/acquiring/transactions' },
];

function createPaymentRegistry(config = {}) {
  const sumup = createSumUpConnector(config.sumup || {});
  const impl = new Map([['sumup', sumup]]);
  return {
    get(id) { const c = impl.get(id); if (!c) throw new Error(`Betalingsintegrationen "${id}" er ikke bygget som API endnu`); return c; },
    info(id) { return id === 'sumup' ? { id, name: sumup.name, kind: 'api', status: sumup.status, description: sumup.description, data: sumup.data, scopes: sumup.scopes } : PROVIDERS.find((p) => p.id === id); },
    list() { return [this.info('nets'), this.info('sumup'), ...PROVIDERS.filter((p) => p.id !== 'nets')]; },
  };
}

module.exports = { createPaymentRegistry, PROVIDERS };
