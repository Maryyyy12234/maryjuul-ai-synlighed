'use strict';
// Fælles connector-register. Kun Shopify er implementeret. De andre er
// planlagte og kan ikke forbindes – UI viser "Kommer senere".
// Oplysningerne om de planlagte systemer kommer fra brugerens research og er
// IKKE verificeret i kode endnu.

const { createShopifyConnector } = require('./shopify');

const PLANNED = [
  { id: 'zettle', name: 'PayPal Point of Sale (Zettle)', description: 'Salg, produkter, lager og betalinger. Danmark er et understøttet marked.',
    docs: 'https://developer.zettle.com/docs/api', todo: 'Afklar partneradgang, OAuth-flow og webhooks. Afklar om lagerdata er pr. butik.' },
  { id: 'lightspeed', name: 'Lightspeed Retail', description: 'Salg, produkter og lager via udviklerapp, som flere butikker kan forbinde.',
    docs: 'https://x-series-api.lightspeedhq.com', todo: 'Afklar hvilken Lightspeed-serie (X/R) danske butikker bruger, og partnerkrav.' },
  { id: 'shopbox', name: 'Shopbox', description: 'Dansk kassesystem med offentlig API-dokumentation.',
    docs: 'https://shopbox.com', todo: 'Kontakt Shopbox om API-adgang, godkendelse og om der findes webhooks.' },
  { id: 'csv', name: 'CSV-import', description: 'Upload salg og lager fra en fil, hvis kassesystemet ikke har et API.',
    docs: null, todo: 'Definér skabelon (dato, varenr., variant, antal, pris, moms, butik) og importflow.' },
];

function createConnectorRegistry(config = {}) {
  const shopify = createShopifyConnector(config.shopify || {});
  const implemented = new Map([[shopify.id, shopify]]);
  return {
    get(id) { const c = implemented.get(id); if (!c) throw new Error(`Integrationen "${id}" er ikke bygget endnu`); return c; },
    list() {
      return [
        { id: shopify.id, name: shopify.name, description: shopify.description, status: shopify.status, capabilities: shopify.capabilities, scopes: shopify.scopes },
        ...PLANNED.map((p) => ({ ...p, status: 'planned', capabilities: {} })),
      ];
    },
  };
}

module.exports = { createConnectorRegistry, PLANNED };
