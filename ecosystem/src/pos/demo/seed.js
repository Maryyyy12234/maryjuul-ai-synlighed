'use strict';
// DEMO: En tøjbutik med fysisk kasse i Aarhus og et baglager.
// Historiske salg over 35 dage. Alle navne er markeret (DEMO).

function seedClothingStore(fake, clock) {
  const butik = fake.addLocation('Butik Aarhus (DEMO)');
  const lager = fake.addLocation('Baglager (DEMO)');
  const sizes = ['XS', 'S', 'M', 'L', 'XL'];
  const hoodie = fake.addProduct({ title: 'Oversized Hoodie', productType: 'Hoodies',
    variants: sizes.map((sz) => ({ title: sz, sku: `HOOD-${sz}`, priceOre: 49900, costOre: 18000 })) });
  const tee = fake.addProduct({ title: 'Basic T-shirt', productType: 'T-shirts',
    variants: ['S', 'M', 'L'].map((sz) => ({ title: sz, sku: `TEE-${sz}`, priceOre: 19900, costOre: 6000 })) });
  const tote = fake.addProduct({ title: 'Mulepose', productType: 'Tilbehør',
    variants: [{ title: 'Default Title', sku: 'TOTE-1', priceOre: 12900, costOre: 3000, options: [{ name: 'Title', value: 'Default Title' }] }] });
  const hv = Object.fromEntries(hoodie.variants.map((v) => [v.title, v]));
  const tv = Object.fromEntries(tee.variants.map((v) => [v.title, v]));
  const start = { XS: 12, S: 30, M: 40, L: 25, XL: 12 };
  for (const sz of sizes) fake.setStock(hv[sz].itemId, butik.id, start[sz]);
  fake.setStock(hv.L.itemId, lager.id, 10);
  for (const sz of ['S', 'M', 'L']) fake.setStock(tv[sz].itemId, butik.id, 40);
  fake.setStock(tote.variants[0].itemId, butik.id, 30);

  // 35 dages historik. Hoodie M sælger hver dag og er ved at løbe tør.
  for (let d = 0; d < 35; d++) {
    clock.set(new Date(Date.parse('2026-10-01T10:00:00Z') + d * 86400000).toISOString());
    fake.sell({ lines: [{ variantId: hv.M.id, qty: 1 }], locationId: butik.id });
    if (d % 2 === 0) fake.sell({ lines: [{ variantId: hv.S.id, qty: 1 }, { variantId: tv.M.id, qty: 1 }], locationId: butik.id });
    if (d % 3 === 0) fake.sell({ lines: [{ variantId: hv.L.id, qty: 1 }], locationId: butik.id, discountOre: 5000 });
    if (d % 7 === 0) fake.sell({ lines: [{ variantId: hv.XS.id, qty: 1 }, { variantId: hv.XL.id, qty: 1 }], locationId: butik.id });
    if (d >= 21) fake.sell({ lines: [{ variantId: tv.S.id, qty: 1 }, { variantId: tv.L.id, qty: 1 }], locationId: butik.id }); // T-shirts tager fart
    if (d % 5 === 0) fake.sell({ lines: [{ variantId: tote.variants[0].id, qty: 1 }], channel: 'online' });
  }
  return { butik, lager, hoodie, tee, tote, hv, tv };
}

module.exports = { seedClothingStore };
