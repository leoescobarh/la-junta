const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../dist/pricing.js');
const C = require('../dist/calculator.js');
const now = Date.parse('2026-09-09T12:00:00Z');
const quote = changes => ({ price: 4500, currency: 'CLP', pack: 20, unit: 'un', status: 'ok', available: true, productName: 'Vienesas de prueba 20 un.', productUrl: 'https://www.jumbo.cl/salchichas-san-jorge-1-kg-2/p', fetchedAt: '2026-09-09T10:00:00Z', ...changes });
const snapshot = offer => ({ schemaVersion: 1, maxAgeHours: 24, stores: { jumbo: { products: { vienesa: offer } } } });
const market = changes => P.resolve(snapshot(quote(changes)), 'jumbo', now);
const row = result => result.items.find(item => item.id === 'vienesa');

function twoStores() {
  const value = snapshot(quote({ price: 4000, pack: 20 }));
  value.stores.lider = { products: { vienesa: quote({ price: 2300, pack: 10, productUrl: 'https://super.lider.cl/ip/vienesas/123' }) } };
  return value;
}

test('compara costo para cubrir la cantidad, no solo precio del paquete', () => {
  const source = twoStores();
  const one = P.compare(source, ['vienesa'], now, { vienesa: 10 })[0];
  assert.equal(one.cheapest.storeId, 'lider');
  const many = P.compare(source, ['vienesa'], now, { vienesa: 20 })[0];
  assert.equal(many.cheapest.storeId, 'jumbo');
  assert.equal(many.cheapest.cost, 4000);
  assert.equal(P.compare(source, ['vienesa'], now)[0].cheapest.unitPrice, 200);
});

test('sin redondeo compara la cantidad proporcional y descarta precios viejos', () => {
  const source = twoStores();
  assert.equal(P.compare(source, ['vienesa'], now, { vienesa: 10 }, false)[0].cheapest.storeId, 'jumbo');
  source.stores.jumbo.products.vienesa.status = 'stale';
  assert.equal(P.compare(source, ['vienesa'], now)[0].cheapest.storeId, 'lider');
  source.stores.lider.products.vienesa.available = false;
  assert.equal(P.compare(source, ['vienesa'], now)[0].cheapest, null);
});

test('presupuesto automático descuenta stock antes de elegir supermercado', () => {
  const state = { ...C.defaultState(), adults: 10, children: 0, margin: 0, stock: { vienesa: 10 } };
  const market = P.bestMarket(twoStores(), C.calculate(state).items, true, now);
  const result = C.calculate(state, market);
  assert.equal(row(result).quote.storeId, 'lider');
  assert.equal(row(result).buy, 10);
  assert.equal(row(result).cost, 2300);
});

test('un precio reciente aplica su formato real de 20 unidades al redondeo', () => {
  const item = row(C.calculate(C.defaultState(), market()));
  assert.equal(item.required, 21);
  assert.equal(item.pack, 20);
  assert.equal(item.packs, 2);
  assert.equal(item.buy, 40);
  assert.equal(item.cost, 9000);
  assert.equal(item.priceKind, 'fresh');
});

test('un precio manual gana sobre la tienda y corresponde al formato mostrado', () => {
  const item = row(C.calculate({ ...C.defaultState(), prices: { vienesa: 5000 } }, market()));
  assert.equal(item.pack, 20);
  assert.equal(item.cost, 10000);
  assert.equal(item.priceKind, 'manual');
});

test('una consulta fallida o antigua conserva el precio claramente marcado como anterior', () => {
  assert.equal(market({ status: 'stale' }).vienesa.status, 'stale');
  const old = market({ fetchedAt: '2026-09-07T12:00:00Z' });
  assert.equal(old.vienesa.status, 'stale');
  assert.equal(row(C.calculate(C.defaultState(), old)).cost, 9000);
  assert.match(P.itemLabel(row(C.calculate(C.defaultState(), old))), /Anterior/);
});

test('sin stock se usa una estimación etiquetada y nunca un precio cero de la tienda', () => {
  const item = row(C.calculate(C.defaultState(), market({ available: false, status: 'unavailable', price: null })));
  assert.equal(item.priceKind, 'example');
  assert.equal(item.pack, 10);
  assert.equal(item.price, 2800);
  assert.match(P.itemLabel(item), /Sin stock/);
});

test('se rechazan moneda, formato, fecha y precios inválidos del archivo público', () => {
  for (const changes of [{ price: 0 }, { price: '4500' }, { price: Infinity }, { currency: 'USD' }, { pack: 0 }, { pack: 2.5 }, { unit: 'kg' }, { fetchedAt: null }, { fetchedAt: '2099-01-01T00:00:00Z' }]) {
    assert.ok(!market(changes).vienesa.usable, JSON.stringify(changes));
  }
});

test('los enlaces de fichas solo admiten HTTPS y dominios de la tienda elegida', () => {
  for (const url of ['javascript:alert(1)', 'https://www.jumbo.cl.ejemplo.com/p', 'https://usuario@www.jumbo.cl/p', 'http://www.jumbo.cl/p', 'https://www.jumbo.cl:9000/p']) {
    assert.equal(P.safeProductUrl(url, 'jumbo'), null);
    assert.ok(!market({ productUrl: url }).vienesa.usable);
  }
  assert.equal(P.safeProductUrl(quote().productUrl, 'mercadolibre'), null);
});

test('una tienda sin integración mantiene el cálculo original y la cobertura de ejemplo', () => {
  const result = C.calculate(C.defaultState(), P.resolve(snapshot(quote()), 'mercadolibre', now));
  assert.equal(result.total, 37300);
  assert.deepEqual(P.coverage(result.items), { fresh: 0, stale: 0, manual: 0, example: 5 });
});

test('la lista exportada conserva la fecha y advierte los precios anteriores', () => {
  const text = C.listText(C.calculate(C.defaultState(), market({ status: 'stale' })));
  assert.match(text, /precio anterior, no confirmado/);
  assert.match(text, /2026-09-09T10:00:00Z/);
  assert.match(text, /Precio de ejemplo/);
});

test('una actualización pendiente no inventa fecha, precio ni cobertura', () => {
  const pending = market({ status: 'pending', price: null, fetchedAt: null }).vienesa;
  assert.equal(pending.status, 'missing');
  assert.ok(!pending.usable);
  assert.equal(pending.fetchedAt, null);
});
