/* Interfaz progresiva, sin librerías, claves ni servicios obligatorios. */
(function () {
  'use strict';
  const D = window.JuntaData;
  const C = window.JuntaCalculator;
  const P = window.JuntaPricing;
  const $ = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const paths = {
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.01"/>',
    basket: '<path d="m4 9 2 11h12l2-11M2 9h20M8 9l4-6 4 6m-7 4v3m6-3v3"/>',
    users: '<path d="M3 20v-2a5 5 0 0 1 10 0v2m3-13a3 3 0 0 1 0 6m1 2a5 5 0 0 1 4 5"/><circle cx="8" cy="7" r="3"/>',
    wallet: '<path d="M20 8V5H5a2 2 0 0 0 0 4h15v11H5a2 2 0 0 1-2-2V7m17 6h-5v4h5m-3-2h.01"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    external: '<path d="M14 3h7v7m0-7L10 14M10 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6"/>',
    spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4"/>',
    copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
    print: '<path d="M6 9V3h12v6M6 17H3v-7a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v7h-3M6 14h12v7H6zm11-2h.01"/>',
    check: '<path d="m5 12 4 4L19 6"/>'
  };
  const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.info}</svg>`;
  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
  let state = C.defaultState();
  let result;
  let filter = 'all';
  let toastTimeout;
  let announcementTimeout;
  let snapshot = window.JuntaPriceSnapshot || { schemaVersion: 1, stores: {} };
  let useStorePrices = true;
  let loadingPrices = false;
  let feedMessage = '';
  let pricesByStore = {};
  let manualFormatsByStore = {};
  let market = {};
  $('store').innerHTML = Object.entries(D.stores).map(([id, store]) => `<option value="${escape(id)}">${escape(store.name)}</option>`).join('');
  function sourceMarkup(item) {
    return `<span class="price-origin price-origin-${item.priceKind}">${escape(P.itemLabel(item))}</span>${item.quote?.usable && item.quote.available === null ? '<small>Disponibilidad sin confirmar</small>' : ''}`;
  }
  function drawPriceStatus() {
    const count = P.coverage(result.items);
    const store = snapshot.stores?.[state.store];
    const pieces = [];
    if (count.fresh) pieces.push(`${count.fresh} con precio consultado`);
    if (count.stale) pieces.push(`${count.stale} con precio anterior`);
    if (count.manual) pieces.push(`${count.manual} editados`);
    if (count.example) pieces.push(`${count.example} de ejemplo`);
    $('price-coverage').textContent = pieces.length ? pieces.join(' · ') : 'Selecciona comidas para ver los precios.';
    $('price-panel-budget').textContent = pieces.length ? pieces.join(' · ') + '. CLP.' : 'Precios y cobertura en tu lista.';
    $('price-sync-status').textContent = !useStorePrices ? 'Actualización de tienda desactivada. Se usan precios editados o de ejemplo.' : feedMessage || (store?.checkedAt ? `Último intento: ${P.dateLabel(store.checkedAt)}. ${store.scope || ''}` : state.store === 'jumbo' ? 'Aún no hay una actualización publicada de esta tienda. Las estimaciones están identificadas en cada fila.' : 'Esta tienda tiene enlaces de búsqueda; todavía no tiene productos configurados para actualizar precios.');
    $('clear-price-overrides').hidden = !Object.keys(state.prices).length;
    $('refresh-prices').disabled = loadingPrices;
    $('refresh-prices').textContent = loadingPrices ? 'Consultando…' : 'Revisar actualización';
    drawComparison();
  }
  function drawComparison() {
    const rows = P.compare(snapshot, result.items.map(item => item.id));
    const active = rows.filter(row => row.offers.some(entry => entry.offer.usable));
    $('comparison-status').textContent = active.length ? 'El menor precio confirmado aparece destacado. Los precios web pueden cambiar según promoción o disponibilidad.' : 'Todavía no hay precios confirmados para comparar; se mantienen las estimaciones de ejemplo.';
    $('comparison-table-wrap').innerHTML = active.length ? `<div class="comparison-scroll"><table class="comparison-table"><thead><tr><th>Ingrediente</th>${Object.values(D.stores).map(store => `<th>${escape(store.name)}</th>`).join('')}<th>Más barato</th></tr></thead><tbody>${rows.filter(row => row.offers.some(entry => entry.offer.usable || entry.offer.status === 'stale')).map(row => `<tr><th>${escape(row.name)}</th>${row.offers.map(entry => { const offer = entry.offer; return `<td>${offer.usable ? `<strong${row.cheapest?.storeId === entry.storeId ? ' class="comparison-best"' : ''}>${C.money(offer.price)}</strong><small>${escape(offer.status === 'fresh' ? 'Actualizado' : 'Anterior')}</small>` : '<span class="comparison-empty">—</span>'}</td>`; }).join('')}<td>${row.cheapest ? `<strong>${escape(row.cheapest.storeName)}</strong>` : '—'}</td></tr>`).join('')}</tbody></table></div>` : '';
  }
  async function loadPrices(manual = false) {
    if (loadingPrices) return;
    if (location.protocol === 'file:') {
      if (manual) toast('En este archivo local se usa la última actualización incluida. Al publicar, se consultará la disponible en tu web.');
      return;
    }
    loadingPrices = true;
    drawPriceStatus();
    try {
      const response = await fetch(new URL('prices.json', location.href), { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Sin archivo de precios');
      const value = await response.json();
      if (value?.schemaVersion !== 1 || !value.stores || typeof value.stores !== 'object') throw new Error('Archivo no válido');
      // Si se empezó a escribir durante la descarga, espera a la próxima revisión.
      if (!manual && document.activeElement?.matches('input,select,textarea')) return;
      // Solo una variación del formato exige revisar lo ya marcado como comprado.
      const nextMarket = useStorePrices ? P.resolve(value, state.store) : {};
      for (const item of result.items) {
        const nextPack = nextMarket[item.id]?.usable ? nextMarket[item.id].pack : D.ingredients[item.id].pack;
        if (nextPack !== item.pack) delete state.checked[item.id];
      }
      snapshot = value;
      feedMessage = '';
      if (manual) toast('Se revisó la última actualización publicada');
    } catch (_) {
      feedMessage = 'No se pudo consultar la última actualización. Se conserva la información disponible con su fecha original.';
      if (manual) toast('No se pudo consultar la actualización. Revisa la fecha indicada en cada precio.');
    } finally {
      loadingPrices = false;
      if (!manual && document.activeElement?.matches('input,select,textarea')) drawPriceStatus();
      else refresh();
    }
  }
  function toast(message) {
    clearTimeout(toastTimeout);
    $('toast').textContent = message;
    $('toast').classList.add('is-visible');
    toastTimeout = setTimeout(() => $('toast').classList.remove('is-visible'), 3600);
  }
  function drawFilters() {
    $('category-filters').innerHTML = D.filters.map(f => `<button class="filter-chip" data-filter="${f.id}" aria-pressed="${filter === f.id}">${escape(f.name)}</button>`).join('');
  }
  function drawFoods() {
    $('food-grid').innerHTML = D.foods.filter(f => filter === 'all' || f.group === filter).map(food => {
      const active = Boolean(state.meals[food.id]);
      return `<button class="food-card" data-food="${food.id}" aria-pressed="${active}" aria-controls="selected-meals" aria-label="${escape(food.name)}${active ? ', incluido en tu menú' : ', agregar al menú'}"><span class="food-check" aria-hidden="true">${active ? '✓' : '+'}</span><span class="food-emoji" aria-hidden="true">${food.emoji}</span><strong>${escape(food.name)}</strong><small>${escape(food.description)}</small></button>`;
    }).join('');
  }
  function mealQuantity(m) {
    if (m.food.id === 'pizza') return `${C.decimal(m.servings / 8)} pizzas · ${C.decimal(m.servings)} porciones`;
    if (m.food.basis === 'grams') return `${C.formatQty(m.servings / 1000, 'kg')}${m.food.id === 'asado' ? ' de carne' : m.food.id === 'pastas' ? ' de pasta' : ''}`;
    if (m.food.basis === 'liters') return C.formatQty(m.servings, 'L');
    return `${C.decimal(m.servings)} ${m.food.unit}`;
  }
  function mealSubtitle(m) { return `${m.variant.name} · ${C.decimal(m.selected.share)} % del grupo`; }
  function drawMeals() {
    const openMeals = new Set(Array.from(document.querySelectorAll('.meal-card details[open]'), el => el.dataset.details));
    const existing = new Set(Array.from(document.querySelectorAll('.meal-card'), el => el.dataset.meal));
    if (!result.mealResults.length) {
      $('selected-meals').innerHTML = '<div class="empty-state"><span class="empty-emoji" aria-hidden="true">🍽️</span><strong>La mesa está puesta.</strong><p>Elige al menos una comida para empezar a calcular.</p></div>';
      return;
    }
    $('selected-meals').innerHTML = result.mealResults.map(m => {
      const f = m.food;
      const s = m.selected;
      const open = openMeals.has(f.id) || !existing.has(f.id);
      return `<article class="meal-card" data-meal="${f.id}"><details data-details="${f.id}" ${open ? 'open' : ''}><summary><span class="meal-emoji" aria-hidden="true">${f.emoji}</span><span class="meal-title"><strong>${escape(f.name)}</strong><small id="subtitle-${f.id}">${escape(mealSubtitle(m))}</small></span><span class="meal-total" id="quantity-${f.id}">${escape(mealQuantity(m))}</span><span class="meal-chevron" aria-hidden="true">⌄</span></summary><div class="meal-fields">
        <div class="meal-field"><label for="variant-${f.id}">¿Cómo los preparamos?</label><select id="variant-${f.id}" data-meal-field="variant" data-id="${f.id}">${Object.entries(f.variants).map(([id, v]) => `<option value="${id}" ${id === s.variant ? 'selected' : ''}>${escape(v.name)}</option>`).join('')}</select></div>
        <div class="meal-field"><label for="portion-${f.id}">${escape(f.portionLabel)}</label><input id="portion-${f.id}" data-meal-field="portion" data-id="${f.id}" type="number" inputmode="decimal" min="${f.min}" max="${f.max}" step="${f.step}" value="${s.portion}"></div>
        <div class="meal-share"><div class="meal-share-head"><label for="share-${f.id}">¿Cuánto del grupo comerá esto?</label><output id="share-value-${f.id}" for="share-${f.id}">${C.decimal(s.share)} %</output></div><input id="share-${f.id}" data-meal-field="share" data-id="${f.id}" type="range" min="0" max="100" step="1" value="${s.share}"><div class="share-foot"><span id="people-${f.id}">${C.decimal(result.guests * s.share / 100, 1)} personas aprox.</span><div class="share-shortcuts"><button data-share="50" data-id="${f.id}">La mitad</button><button data-share="100" data-id="${f.id}">Todos</button></div></div></div>
        ${m.variant.note ? `<p class="meal-detail-note">${escape(m.variant.note)}</p>` : ''}
        <div class="meal-foot"><span>Incluye ${state.margin} % extra</span><button class="remove-meal" data-remove="${f.id}" aria-label="Quitar ${escape(f.name)} del menú">Quitar del menú</button></div>
      </div></details></article>`;
    }).join('');
  }
  function updateMealResults() {
    result.mealResults.forEach(m => {
      const id = m.food.id;
      if ($(`quantity-${id}`)) $(`quantity-${id}`).textContent = mealQuantity(m);
      if ($(`subtitle-${id}`)) $(`subtitle-${id}`).textContent = mealSubtitle(m);
      if ($(`share-value-${id}`)) $(`share-value-${id}`).textContent = `${C.decimal(m.selected.share)} %`;
      if ($(`people-${id}`)) $(`people-${id}`).textContent = `${C.decimal(result.guests * m.selected.share / 100, 1)} personas aprox.`;
      const foot = document.querySelector(`[data-meal="${id}"] .meal-foot>span`);
      if (foot) foot.textContent = `Incluye ${state.margin} % extra`;
    });
  }
  function buyLabel(item) {
    if (!item.buy) return '<strong>Ya lo tienes</strong><small>Sin compra pendiente</small>';
    return `<strong>${C.formatQty(item.buy, item.unit)}</strong><small>${state.roundPackages ? `${C.decimal(item.packs)} × ${C.formatQty(item.pack, item.unit)}` : 'Cantidad sin redondear'}</small>`;
  }
  function drawShopping() {
    const noPeople = result.guests === 0;
    if (!result.items.length) {
      $('shopping-table-wrap').innerHTML = `<div class="empty-state"><span class="empty-emoji" aria-hidden="true">${noPeople ? '🪑' : '🧺'}</span><strong>${noPeople ? 'Falta invitar a alguien.' : 'Aquí aparecerá tu lista.'}</strong><p>${noPeople ? 'Agrega adultos o niños para calcular las cantidades.' : 'Elige una comida y asigna un porcentaje de invitados mayor que cero.'}</p></div>`;
      return;
    }
    let previous = '';
    const body = result.items.map(item => {
      const group = item.group !== previous ? `<tr class="group-row"><th colspan="8" scope="rowgroup">${escape(item.group)}</th></tr>` : '';
      previous = item.group;
      return `${group}<tr class="item-row${item.ready ? ' is-ready' : ''}" id="item-${item.id}">
        <td class="check-cell"><input type="checkbox" data-item-field="checked" data-id="${item.id}" ${item.ready ? 'checked' : ''} ${item.buy === 0 ? 'disabled' : ''} aria-label="Marcar ${escape(item.name)} como listo"></td>
        <td class="ingredient-name"><strong>${escape(item.name)}</strong><small>${escape(item.from.join(' + '))}</small>${item.quote?.usable ? `<small class="mapped-product">${escape(item.quote.productName)}</small>` : ''}</td>
        <td class="required-amount" data-label="Necesitas">${C.formatQty(item.required, item.unit)}</td>
        <td class="stock-cell" data-label="Ya tengo"><div class="table-input"><input id="stock-${item.id}" type="number" min="0" max="1000000" step="${item.unit === 'un' ? '1' : '0.001'}" inputmode="decimal" value="${item.stock}" data-item-field="stock" data-id="${item.id}" aria-label="Cantidad que ya tengo de ${escape(item.name)}, en ${escape(item.unit)}"><span>${item.unit}</span></div></td>
        <td class="buy-amount" data-label="A comprar">${buyLabel(item)}</td>
        <td class="price-cell" data-label="Precio por formato"><div class="table-input price-input"><span>$</span><input id="price-${item.id}" type="number" min="0" max="10000000" step="1" inputmode="numeric" value="${item.price}" data-item-field="prices" data-id="${item.id}" aria-label="Precio en pesos chilenos de ${escape(item.name)} por ${escape(C.formatQty(item.pack, item.unit))}"></div><small>por ${C.formatQty(item.pack, item.unit)}</small><div class="price-source">${sourceMarkup(item)}</div></td>
        <td class="subtotal" data-label="Subtotal">${C.money(item.cost)}</td>
        <td class="store-cell"><a class="shop-link" href="${escape(item.quote?.productUrl || C.storeUrl(state.store, item.query))}" target="_blank" rel="noopener noreferrer" aria-label="Ver ${escape(item.name)} en ${escape(D.stores[state.store].name)} (abre una pestaña nueva)">${item.quote?.productUrl ? item.quote.usable ? 'Ver producto' : 'Ver ficha' : 'Buscar'} ${icon('external')}</a>${item.quote?.productUrl && !item.quote.usable ? '<small>Revisa precio y formato en tienda.</small>' : ''}</td>
      </tr>`;
    }).join('');
    $('shopping-table-wrap').innerHTML = `<table class="shopping-table"><caption class="sr-only">Ingredientes y presupuesto estimado. Precios en pesos chilenos.</caption><thead><tr><th scope="col"><span class="sr-only">Listo</span></th><th scope="col">Ingrediente</th><th scope="col">Necesitas</th><th scope="col">Ya tengo</th><th scope="col">A comprar</th><th scope="col">Precio / formato</th><th scope="col">Subtotal</th><th scope="col" class="store-th">Tienda</th></tr></thead><tbody>${body}</tbody></table>`;
  }
  function updateShoppingValues() {
    // Conserva el foco y la entrada parcial mientras se escribe un precio o stock.
    result.items.forEach(item => {
      const row = $(`item-${item.id}`);
      if (!row) return;
      row.classList.toggle('is-ready', item.ready);
      row.querySelector('.buy-amount').innerHTML = buyLabel(item);
      row.querySelector('.subtotal').textContent = C.money(item.cost);
      row.querySelector('.price-source').innerHTML = sourceMarkup(item);
      const check = row.querySelector('[data-item-field="checked"]');
      check.checked = item.ready;
      check.disabled = item.buy === 0;
    });
  }
  function drawTotals() {
    $('guest-total').textContent = result.guests;
    $('budget-total').textContent = C.money(result.total);
    $('quick-total').textContent = C.money(result.total);
    $('mobile-total').textContent = C.money(result.total);
    $('per-person').textContent = C.money(result.perPerson);
    $('pending-total').textContent = C.money(result.pending);
    $('ingredient-count').textContent = result.items.length;
    $('nav-count').textContent = result.items.length;
    $('shopping-total').textContent = C.money(result.total);
    $('selection-counter').textContent = `${result.mealResults.length} ${result.mealResults.length === 1 ? 'elegido' : 'elegidos'}`;
    $('checked-progress').textContent = `${result.ready} de ${result.items.length} ingredientes listos`;
    $('shopping-description').textContent = `${result.guests} personas · ${state.adults} adultos y ${state.children} niños · ${state.margin} % extra`;
    $('margin-label').textContent = `${state.margin} %`;
    $('child-factor-label').textContent = `${Math.round(state.childFactor * 100)} %`;
    $('copy-button').disabled = !result.items.length;
    $('download-button').disabled = !result.items.length;
    $('print-button').disabled = !result.items.length;
    $('clear-checks').disabled = !Object.values(state.checked).some(Boolean);
    const mains = result.mealResults.filter(m => m.food.group === 'main');
    $('balance-button').hidden = mains.length < 2;
    const note = $('allocation-note');
    note.hidden = mains.length < 2 || Math.abs(result.mainShare - 100) < 0.01;
    if (!note.hidden) note.textContent = `Tus platos principales suman ${C.decimal(result.mainShare)} % de porciones. ${result.mainShare > 100 ? 'Si son alternativas, repártelos entre el grupo; si comerán de todo, déjalo así.' : 'Aumenta la participación si quieres cubrir a todo el grupo con estos platos.'}`;
    document.querySelectorAll('[data-count]').forEach(button => { const value = state[button.dataset.count]; button.disabled = Number(button.dataset.delta) < 0 ? value <= 0 : value >= 500; });
    clearTimeout(announcementTimeout);
    announcementTimeout = setTimeout(() => { $('calculation-status').textContent = `${result.guests} personas. ${result.items.length} ingredientes. Total estimado ${C.money(result.total)}.`; }, 600);
    drawPriceStatus();
  }
  function refresh(options = {}) {
    market = useStorePrices ? P.resolve(snapshot, state.store) : {};
    for (const id of Object.keys(state.prices)) {
      const expectedPack = market[id]?.usable ? market[id].pack : D.ingredients[id]?.pack;
      const manualPack = manualFormatsByStore[state.store]?.[id];
      if (manualPack !== undefined && expectedPack !== manualPack) delete state.prices[id];
    }
    result = C.calculate(state, market);
    state = result.state;
    if (options.catalog) drawFoods();
    if (options.meals) drawMeals(); else updateMealResults();
    if (options.inline) updateShoppingValues(); else drawShopping();
    drawTotals();
  }
  function syncControls() {
    $('adults').value = state.adults;
    $('children').value = state.children;
    $('child-factor').value = state.childFactor * 100;
    $('margin').value = state.margin;
    $('round-packages').checked = state.roundPackages;
    $('store').value = state.store;
    document.querySelectorAll('[data-appetite]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.appetite) === state.appetite)));
  }
  function clearCompleted() { state.checked = {}; }
  function toggleFood(id) {
    const food = D.foods.find(f => f.id === id);
    if (!food) return;
    const adding = !state.meals[id];
    if (adding) state.meals[id] = { variant: Object.keys(food.variants)[0], portion: food.portion, share: 100 };
    else delete state.meals[id];
    clearCompleted();
    refresh({ catalog: true, meals: true });
    document.querySelector(`[data-food="${id}"]`)?.focus({ preventScroll: true });
    toast(adding ? `${food.name} agregado al menú` : `${food.name} quitado del menú`);
  }
  $('category-filters').addEventListener('click', event => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    filter = button.dataset.filter;
    drawFilters();
    drawFoods();
    document.querySelector(`[data-filter="${filter}"]`).focus({ preventScroll: true });
  });
  $('food-grid').addEventListener('click', event => {
    const button = event.target.closest('[data-food]');
    if (button) toggleFood(button.dataset.food);
  });
  document.querySelectorAll('[data-count]').forEach(button => button.addEventListener('click', () => {
    const field = button.dataset.count;
    state[field] = C.clamp(state[field] + Number(button.dataset.delta), 0, 500);
    $(field).value = state[field];
    clearCompleted();
    refresh();
  }));
  ['adults', 'children', 'margin', 'child-factor'].forEach(id => {
    $(id).addEventListener('input', event => {
      const value = event.target.value;
      if (id === 'child-factor') state.childFactor = C.number(value, 60) / 100;
      else state[id] = C.number(value);
      clearCompleted();
      refresh();
    });
    $(id).addEventListener('change', () => syncControls());
  });
  $('appetite-controls').addEventListener('click', event => {
    const button = event.target.closest('[data-appetite]');
    if (!button) return;
    state.appetite = Number(button.dataset.appetite);
    clearCompleted();
    syncControls();
    refresh();
  });
  $('selected-meals').addEventListener('input', event => {
    const field = event.target.dataset.mealField;
    const id = event.target.dataset.id;
    if (!field || field === 'variant' || !state.meals[id]) return;
    state.meals[id][field] = event.target.value === '' ? D.foods.find(f => f.id === id).portion : Number(event.target.value);
    clearCompleted();
    refresh();
  });
  $('selected-meals').addEventListener('change', event => {
    const field = event.target.dataset.mealField;
    const id = event.target.dataset.id;
    if (!field || !state.meals[id]) return;
    if (field === 'variant') {
      state.meals[id].variant = event.target.value;
      // El arroz se mide seco; evita heredar la porción de 200 g de ensalada.
      if (id === 'sides') state.meals[id].portion = event.target.value === 'arroz' ? 75 : 200;
      clearCompleted();
      refresh({ meals: true });
      $(`variant-${id}`).focus({ preventScroll: true });
    } else event.target.value = state.meals[id][field];
  });
  $('selected-meals').addEventListener('click', event => {
    const remove = event.target.closest('[data-remove]');
    if (remove) {
      const id = remove.dataset.remove;
      toggleFood(id);
      if (!document.querySelector(`[data-food="${id}"]`)) $('selected-heading').focus({ preventScroll: true });
    }
    const shortcut = event.target.closest('[data-share]');
    if (shortcut) {
      const id = shortcut.dataset.id;
      state.meals[id].share = Number(shortcut.dataset.share);
      $(`share-${id}`).value = state.meals[id].share;
      clearCompleted();
      refresh();
    }
  });
  $('balance-button').addEventListener('click', () => {
    const mains = D.foods.filter(f => f.group === 'main' && state.meals[f.id]);
    const base = Math.floor(100 / mains.length);
    mains.forEach((food, i) => {
      state.meals[food.id].share = base + (i < 100 % mains.length ? 1 : 0);
      $(`share-${food.id}`).value = state.meals[food.id].share;
    });
    clearCompleted();
    refresh();
    toast('Porciones repartidas entre los platos principales');
  });
  $('round-packages').addEventListener('change', event => {
    state.roundPackages = event.target.checked;
    clearCompleted();
    refresh();
  });
  $('store').addEventListener('change', event => {
    pricesByStore[state.store] = { ...state.prices };
    state.store = event.target.value;
    state.prices = { ...(pricesByStore[state.store] || {}) };
    clearCompleted();
    refresh();
  });
  $('use-store-prices').addEventListener('change', event => { useStorePrices = event.target.checked; clearCompleted(); refresh(); });
  $('refresh-prices').addEventListener('click', () => loadPrices(true));
  $('clear-price-overrides').addEventListener('click', () => { state.prices = {}; pricesByStore[state.store] = {}; manualFormatsByStore[state.store] = {}; refresh(); });
  $('shopping-table-wrap').addEventListener('input', event => {
    const field = event.target.dataset.itemField;
    const id = event.target.dataset.id;
    if (!field || field === 'checked' || !Object.hasOwn(D.ingredients, id)) return;
    const item = D.ingredients[id];
    const raw = event.target.value;
    state[field][id] = C.clamp(raw, 0, field === 'prices' ? 10000000 : 1000000, field === 'prices' ? item.price : 0);
    if (field === 'prices') {
      if (!manualFormatsByStore[state.store]) manualFormatsByStore[state.store] = {};
      manualFormatsByStore[state.store][id] = result.items.find(row => row.id === id).pack;
    }
    if (field === 'stock') delete state.checked[id];
    refresh({ inline: true });
  });
  $('shopping-table-wrap').addEventListener('change', event => {
    const field = event.target.dataset.itemField;
    const id = event.target.dataset.id;
    if (!field || !Object.hasOwn(D.ingredients, id)) return;
    if (field === 'checked') {
      state.checked[id] = event.target.checked;
      refresh({ inline: true });
    } else event.target.value = state[field][id] ?? (field === 'prices' ? D.ingredients[id].price : 0);
  });
  $('clear-checks').addEventListener('click', () => { clearCompleted(); refresh({ inline: true }); toast('Lista desmarcada'); });
  $('copy-button').addEventListener('click', async () => {
    const text = C.listText(result);
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error('Clipboard fallback');
      await navigator.clipboard.writeText(text);
      toast('Lista copiada. ¡Lista para compartir!');
    } catch (_) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(textarea);
      textarea.select();
      let copied = false;
      try { copied = document.execCommand('copy'); } catch (_) { /* Descargar sigue disponible. */ }
      textarea.remove();
      $('copy-button').focus({ preventScroll: true });
      toast(copied ? 'Lista copiada. ¡Lista para compartir!' : 'El navegador bloqueó la copia. Usa Descargar para guardar la lista.');
    }
  });
  $('download-button').addEventListener('click', () => {
    const blob = new Blob(['\uFEFF' + C.listText(result)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'lista-de-compras-la-junta.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Lista descargada');
  });
  $('print-button').addEventListener('click', () => window.print());
  $('help-button').addEventListener('click', () => $('help-dialog').showModal());
  $('reset-button').addEventListener('click', () => $('reset-dialog').showModal());
  document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  }));
  $('confirm-reset').addEventListener('click', () => {
    state = C.defaultState();
    pricesByStore = {};
    manualFormatsByStore = {};
    useStorePrices = true;
    $('use-store-prices').checked = true;
    filter = 'all';
    $('reset-dialog').close();
    syncControls();
    drawFilters();
    refresh({ catalog: true, meals: true });
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    toast('Todo listo para una nueva junta');
  });
  drawFilters();
  syncControls();
  refresh({ catalog: true, meals: true });
  loadPrices();
  setInterval(() => {
    if (!document.hidden && !document.activeElement?.matches('input,select,textarea')) loadPrices();
  }, 300000);
})();
