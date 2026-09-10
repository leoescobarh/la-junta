/* Valida precios externos y su antigüedad antes de usarlos en el cálculo. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
  else root.JuntaPricing = factory(root.JuntaData);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (data) {
  'use strict';
  function safeProductUrl(value, storeId) {
    try {
      const url = new URL(value);
      const hosts = data.stores[storeId]?.productHosts || [];
      return url.protocol === 'https:' && !url.username && !url.password && !url.port && hosts.includes(url.hostname) ? url.href : null;
    } catch (_) { return null; }
  }
  function resolve(snapshot, storeId, now = Date.now()) {
    const values = {};
    if (snapshot?.schemaVersion !== 1) return values;
    const products = snapshot.stores?.[storeId]?.products;
    if (!products || typeof products !== 'object') return values;
    const maxHours = Math.min(72, Math.max(1, Number(snapshot.maxAgeHours) || 24));
    for (const [id, item] of Object.entries(data.ingredients)) {
      const offer = products[id];
      if (!offer || typeof offer !== 'object') continue;
      const url = safeProductUrl(offer.productUrl, storeId);
      const date = Date.parse(offer.fetchedAt);
      const valid = offer.currency === 'CLP' && typeof offer.price === 'number' && Number.isFinite(offer.price) && offer.price > 0 && offer.price <= 10000000 && typeof offer.pack === 'number' && offer.pack > 0 && offer.pack <= 1000 && (item.unit !== 'un' || Number.isInteger(offer.pack)) && offer.unit === item.unit && url && Number.isFinite(date) && date <= now + 300000;
      let status = 'missing';
      if (offer.available === false || offer.status === 'unavailable') status = 'unavailable';
      else if (valid) status = offer.status === 'ok' && now - date <= maxHours * 3600000 ? 'fresh' : 'stale';
      else if (offer.status === 'error') status = 'error';
      values[id] = {
        status, usable: valid && status !== 'unavailable',
        price: valid ? Math.round(offer.price) : null, pack: valid ? offer.pack : null,
        productUrl: url, productName: String(offer.productName || item.name).slice(0, 300),
        fetchedAt: Number.isFinite(date) ? offer.fetchedAt : null,
        available: typeof offer.available === 'boolean' ? offer.available : null,
        source: String(offer.source || ''), message: String(offer.message || '').slice(0, 300)
      };
    }
    return values;
  }
  function dateLabel(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Sin fecha' : new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' }).format(date);
  }
  function itemLabel(item) {
    if (item.priceKind === 'manual') return 'Precio editado';
    if (item.priceKind === 'fresh') return 'Consultado ' + dateLabel(item.quote.fetchedAt);
    if (item.priceKind === 'stale') return 'Anterior · ' + dateLabel(item.quote.fetchedAt);
    if (item.quote?.status === 'unavailable') return 'Sin stock en consulta' + (item.quote.fetchedAt ? ' ' + dateLabel(item.quote.fetchedAt) : '') + ' · estimación de ejemplo';
    if (item.quote?.status === 'error') return 'Sin actualización · precio de ejemplo';
    return 'Precio de ejemplo';
  }
  function coverage(items) {
    return items.reduce((sum, item) => { sum[item.priceKind || 'example']++; return sum; }, { fresh: 0, stale: 0, manual: 0, example: 0 });
  }
  function compare(snapshot, ingredientIds, now = Date.now(), quantities = {}, roundPackages = true) {
    const stores = Object.entries(data.stores).filter(([id]) => id !== 'mercadolibre');
    const resolved = Object.fromEntries(stores.map(([id]) => [id, resolve(snapshot, id, now)]));
    return ingredientIds.map(id => {
      const ingredient = data.ingredients[id];
      const offers = stores.map(([storeId, store]) => {
        const offer = resolved[storeId][id] || { status: 'missing', usable: false, productName: ingredient.name, productUrl: null };
        const missing = Math.max(0, quantities[id] || 0);
        const packs = offer.usable ? (roundPackages ? Math.max(0, Math.ceil(missing / offer.pack - 1e-9)) : missing / offer.pack) : null;
        return { storeId, storeName: store.name, offer, unitPrice: offer.usable ? offer.price / offer.pack : null,
          packs, cost: offer.usable ? Math.round(packs * offer.price) : null };
      });
      const available = offers.filter(entry => entry.offer.usable && entry.offer.status === 'fresh' && entry.offer.available !== false);
      const byQuantity = Object.hasOwn(quantities, id) && quantities[id] > 0;
      available.sort((a, b) => (byQuantity ? a.cost - b.cost : a.unitPrice - b.unitPrice) || a.unitPrice - b.unitPrice || a.storeId.localeCompare(b.storeId));
      const cheapest = available[0] || null;
      return { id, name: ingredient.name, offers, cheapest };
    });
  }
  function bestMarket(snapshot, items, roundPackages = true, now = Date.now()) {
    const quantities = Object.fromEntries(items.map(item => [item.id, item.missing]));
    const values = {};
    for (const row of compare(snapshot, items.map(item => item.id), now, quantities, roundPackages)) {
      if (row.cheapest) values[row.id] = { ...row.cheapest.offer, storeId: row.cheapest.storeId, storeName: row.cheapest.storeName };
    }
    return values;
  }
  return { safeProductUrl, resolve, dateLabel, itemLabel, coverage, compare, bestMarket };
});
