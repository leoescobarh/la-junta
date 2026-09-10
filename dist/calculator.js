/* Motor independiente de la interfaz y comprobable con node:test. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
  else root.JuntaCalculator = factory(root.JuntaData);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (data) {
  'use strict';
  const number = (v, fallback = 0) => Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : fallback;
  const clamp = (v, min, max, fallback = min) => Math.min(max, Math.max(min, number(v, fallback)));
  const roundUp = (v, step = 1) => Math.max(0, Math.ceil((v - 1e-9) / step) * step);
  const money = v => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v);
  const decimal = (v, max = 2) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: max }).format(v);
  function formatQty(value, unit) {
    if (unit === 'kg' && value > 0 && value < 1) return decimal(value * 1000, 1) + ' g';
    if (unit === 'L' && value > 0 && value < 1) return decimal(value * 1000, 1) + ' ml';
    return decimal(value, unit === 'un' ? 0 : 2) + ' ' + (unit === 'un' ? 'un.' : unit);
  }
  function defaultState() {
    return { adults: 8, children: 2, childFactor: 0.6, appetite: 1, margin: 10, roundPackages: true, store: 'jumbo',
      meals: { completos: { variant: 'italiano', portion: 2, share: 100 } }, prices: {}, stock: {}, checked: {} };
  }
  function sanitizeState(input) {
    const raw = input && typeof input === 'object' ? input : defaultState();
    const state = { adults: Math.round(clamp(raw.adults, 0, 500, 8)), children: Math.round(clamp(raw.children, 0, 500, 2)), childFactor: clamp(raw.childFactor, 0.3, 1, 0.6), appetite: [0.8, 1, 1.25].includes(raw.appetite) ? raw.appetite : 1, margin: clamp(raw.margin, 0, 30, 10), roundPackages: raw.roundPackages !== false, store: Object.hasOwn(data.stores, raw.store) ? raw.store : 'jumbo', meals: {}, prices: {}, stock: {}, checked: {} };
    for (const food of data.foods) {
      if (!raw.meals || !Object.hasOwn(raw.meals, food.id)) continue;
      const entry = raw.meals[food.id] || {};
      state.meals[food.id] = { variant: Object.hasOwn(food.variants, entry.variant) ? entry.variant : Object.keys(food.variants)[0], portion: clamp(entry.portion, food.min, food.max, food.portion), share: clamp(entry.share, 0, 100, 100) };
    }
    for (const [id, item] of Object.entries(data.ingredients)) {
      if (raw.prices && Object.hasOwn(raw.prices, id)) state.prices[id] = Math.round(clamp(raw.prices[id], 0, 10000000, item.price));
      if (raw.stock && Object.hasOwn(raw.stock, id)) {
        const amount = clamp(raw.stock[id], 0, 1000000);
        state.stock[id] = item.unit === 'un' ? Math.floor(amount) : amount;
      }
      if (raw.checked && raw.checked[id] === true) state.checked[id] = true;
    }
    return state;
  }
  function calculate(input, market = {}) {
    const state = sanitizeState(input);
    const guests = state.adults + state.children;
    const equivalent = state.adults + state.children * state.childFactor;
    const quantities = {};
    const mealResults = [];
    for (const food of data.foods) {
      const selected = state.meals[food.id];
      if (!selected) continue;
      const people = (food.actualGuests ? guests : equivalent) * selected.share / 100;
      let servings = people * selected.portion * (food.actualGuests ? 1 : state.appetite) * (1 + state.margin / 100);
      if (food.basis === 'units') servings = roundUp(servings, food.batch || 1);
      const multiplier = servings / (food.basis === 'grams' ? 1000 : 1);
      const variant = food.variants[selected.variant];
      for (const [id, amount] of Object.entries(variant.items)) {
        if (multiplier <= 0) continue;
        if (!quantities[id]) quantities[id] = { amount: 0, from: [] };
        quantities[id].amount += multiplier * amount;
        quantities[id].from.push(food.name);
      }
      mealResults.push({ food, selected, variant, people, servings, multiplier });
    }
    const items = Object.entries(quantities).map(([id, value]) => {
      const baseItem = data.ingredients[id];
      const quote = market[id] || null;
      const item = quote?.usable ? { ...baseItem, pack: quote.pack, price: quote.price } : baseItem;
      const required = roundUp(value.amount, item.unit === 'un' ? 1 : 0.001);
      const stock = state.stock[id] || 0;
      const missing = Math.max(0, Math.round((required - stock) * 1000000) / 1000000);
      const packs = state.roundPackages ? roundUp(missing / item.pack) : missing / item.pack;
      const buy = Math.round((packs * item.pack) * 1000000) / 1000000;
      const price = Object.hasOwn(state.prices, id) ? state.prices[id] : item.price;
      const cost = Math.round(packs * price);
      const checked = state.checked[id] === true;
      const priceKind = Object.hasOwn(state.prices, id) ? 'manual' : quote?.usable ? quote.status : 'example';
      return { ...item, id, required, stock, missing, packs, buy, price, cost, checked, ready: checked || buy === 0, from: value.from, priceKind, quote };
    }).sort((a, b) => data.groups.indexOf(a.group) - data.groups.indexOf(b.group) || a.name.localeCompare(b.name, 'es'));
    const total = items.reduce((sum, item) => sum + item.cost, 0);
    const pending = items.reduce((sum, item) => sum + (item.ready ? 0 : item.cost), 0);
    const mainShare = mealResults.filter(m => m.food.group === 'main').reduce((sum, m) => sum + m.selected.share, 0);
    return { state, guests, equivalent, mealResults, items, total, pending, perPerson: guests ? total / guests : 0, ready: items.filter(i => i.ready).length, mainShare };
  }
  function storeUrl(storeId, query) {
    const store = data.stores[storeId] || data.stores.jumbo;
    if (storeId === 'mercadolibre') return store.url + encodeURIComponent(query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, '-'));
    return store.url + encodeURIComponent(query);
  }
  function listText(result) {
    const s = result.state;
    const lines = ['LA JUNTA · LISTA DE COMPRAS', `${s.adults} adultos + ${s.children} niños · ${s.margin} % extra`, '', 'MENÚ'];
    result.mealResults.forEach(m => lines.push(`• ${m.food.name} — ${m.variant.name} (${decimal(m.selected.share)} % de invitados)`));
    let previous = '';
    for (const item of result.items) {
      if (item.group !== previous) { lines.push('', item.group.toLocaleUpperCase('es')); previous = item.group; }
      lines.push(`${item.ready ? '[✓]' : '[ ]'} ${item.name}: comprar ${formatQty(item.buy, item.unit)}${s.roundPackages && item.packs ? ` (${decimal(item.packs)} × ${formatQty(item.pack, item.unit)})` : ''} — ${money(item.cost)}`);
      if (item.quote?.usable) lines.push(`    ${item.quote.storeName ? item.quote.storeName + ' · ' : ''}${item.quote.productName} · ${item.priceKind === 'manual' ? 'precio editado' : item.priceKind === 'fresh' ? 'precio consultado' : 'precio anterior, no confirmado'} · consulta ${item.quote.fetchedAt}${item.quote.productUrl ? '\n    ' + item.quote.productUrl : ''}`);
      else if (item.priceKind === 'manual') lines.push('    Precio editado manualmente.');
      else lines.push('    Precio de ejemplo; no confirmado con la tienda.');
    }
    lines.push('', `Total estimado: ${money(result.total)}`, `Por persona: ${money(result.perPerson)}`, `Pendiente de comprar: ${money(result.pending)}`, '', 'Moneda CLP. Se indica el origen en cada ingrediente. Precios de ejemplo en CLP para productos sin cotización. Confirma precios, disponibilidad, formatos y despacho en la tienda.');
    return lines.join('\n');
  }
  return { number, clamp, roundUp, money, decimal, formatQty, defaultState, sanitizeState, calculate, storeUrl, listText };
});
