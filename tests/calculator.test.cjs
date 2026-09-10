const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../dist/calculator.js');
const D = require('../dist/data.js');
const base = overrides => ({ ...C.defaultState(), adults: 10, children: 0, margin: 0, roundPackages: false, ...overrides });
const item = (result, id) => result.items.find(i => i.id === id);
const close = (a, b) => assert.ok(Math.abs(a - b) < 0.00001, `${a} debe ser igual a ${b}`);

test('10 adultos y 2 completos requieren 20 panes y 20 vienesas', () => {
  const result = C.calculate(base());
  assert.equal(item(result, 'panCompleto').required, 20);
  assert.equal(item(result, 'vienesa').required, 20);
  close(item(result, 'tomate').required, 1.6);
  close(item(result, 'mayo').required, 0.5);
});

test('la palta se compra entera: se aplica el rendimiento comestible', () => {
  const result = C.calculate(base());
  close(item(result, 'palta').required, 2.286);
});

test('niños, apetito y margen se aplican una sola vez', () => {
  const result = C.calculate(base({ adults: 4, children: 2, childFactor: 0.5, appetite: 1.25, margin: 20 }));
  close(result.equivalent, 5);
  // 5 equivalentes × 2 completos × 1,25 de apetito × 1,2 de margen = 15.
  assert.equal(item(result, 'panCompleto').required, 15);
});

test('las unidades de una preparación se redondean antes de sus ingredientes', () => {
  const result = C.calculate(base({ adults: 1, children: 1, childFactor: 0.6 }));
  assert.equal(item(result, 'panCompleto').required, 4);
  close(item(result, 'tomate').required, 0.32);
});

test('ningún invitado genera cero cantidades, presupuesto y costo por persona', () => {
  const result = C.calculate(base({ adults: 0, children: 0 }));
  assert.deepEqual(result.items, []);
  assert.equal(result.total, 0);
  assert.equal(result.perPerson, 0);
  assert.equal(result.mealResults[0].servings, 0);
});

test('menú vacío o participación cero no generan compras', () => {
  assert.equal(C.calculate(base({ meals: {} })).total, 0);
  const result = C.calculate(base({ meals: { completos: { variant: 'italiano', portion: 2, share: 0 } } }));
  assert.equal(result.items.length, 0);
});

test('los ingredientes compartidos se agregan antes de redondear envases', () => {
  const result = C.calculate(base({ adults: 2, roundPackages: true, meals: {
    completos: { variant: 'italiano', portion: 1, share: 100 },
    sandwiches: { variant: 'churrasco', portion: 1, share: 100 }
  } }));
  const tomatoes = item(result, 'tomate');
  close(tomatoes.required, 0.28);
  assert.equal(tomatoes.packs, 1);
  close(tomatoes.buy, 0.5);
  assert.equal(tomatoes.from.length, 2);
  assert.equal(result.items.filter(i => i.id === 'tomate').length, 1);
});

test('envases de 8 panes: 20 panes requieren 3 paquetes y se cobra el paquete', () => {
  const bread = item(C.calculate(base({ roundPackages: true })), 'panCompleto');
  assert.equal(bread.packs, 3);
  assert.equal(bread.buy, 24);
  assert.equal(bread.cost, 7200);
});

test('el stock se descuenta antes del redondeo y nunca crea compras negativas', () => {
  const result = C.calculate(base({ roundPackages: true, stock: { panCompleto: 5, tomate: 999 } }));
  assert.equal(item(result, 'panCompleto').buy, 16);
  assert.equal(item(result, 'panCompleto').cost, 4800);
  assert.equal(item(result, 'tomate').buy, 0);
  assert.equal(item(result, 'tomate').cost, 0);
  assert.equal(item(result, 'tomate').ready, true);
});

test('sin redondeo se cobra proporcionalmente al formato de referencia', () => {
  const bread = item(C.calculate(base()), 'panCompleto');
  assert.equal(bread.buy, 20);
  assert.equal(bread.cost, 6000);
});

test('precio cero y precio editado se respetan; marcar listo solo baja el pendiente', () => {
  const result = C.calculate(base({ prices: { panCompleto: 0, vienesa: 5000 }, checked: { vienesa: true } }));
  assert.equal(item(result, 'panCompleto').cost, 0);
  assert.equal(item(result, 'vienesa').cost, 10000);
  assert.equal(result.total - result.pending, 10000);
});

test('el costo por persona se divide por personas reales, incluidos niños', () => {
  const result = C.calculate(base({ adults: 4, children: 2 }));
  close(result.perPerson, result.total / 6);
});

test('bebidas usan personas reales y omiten el factor de apetito', () => {
  const result = C.calculate(base({ adults: 2, children: 2, appetite: 1.25, childFactor: 0.3, margin: 10, meals: { drinks: { variant: 'agua', portion: 1, share: 100 } } }));
  close(item(result, 'agua').required, 4.4);
  close(item(result, 'hielo').required, 1.1);
});

test('el asado mixto distribuye el peso total en vacuno, pollo y chorizo', () => {
  const result = C.calculate(base({ meals: { asado: { variant: 'mixto', portion: 400, share: 100 } } }));
  close(item(result, 'vacuno').required, 2.4);
  close(item(result, 'pollo').required, 1.2);
  close(item(result, 'chorizo').required, 0.4);
  close(item(result, 'carbon').required, 5);
});

test('pizza redondea a pizzas completas y escala todos los ingredientes', () => {
  const result = C.calculate(base({ adults: 3, meals: { pizza: { variant: 'queso', portion: 3, share: 100 } } }));
  assert.equal(result.mealResults[0].servings, 16);
  assert.equal(item(result, 'pizzaBase').required, 2);
  close(item(result, 'mozzarella').required, 0.56);
});

test('los porcentajes reparten alternativas sin multiplicar el grupo', () => {
  const result = C.calculate(base({ meals: {
    completos: { variant: 'italiano', portion: 2, share: 50 },
    asado: { variant: 'vacuno', portion: 400, share: 50 }
  } }));
  assert.equal(result.mainShare, 100);
  assert.equal(item(result, 'panCompleto').required, 10);
  close(item(result, 'vacuno').required, 2);
});

test('valores inválidos se normalizan y no propagan NaN o Infinity', () => {
  const result = C.calculate({ adults: -9, children: Infinity, childFactor: -4, appetite: 500, margin: 900, store: '__proto__', prices: { tomate: -5 }, stock: { panCompleto: 2.8 }, meals: { completos: { portion: 'texto', share: -10, variant: '<script>' }, desconocido: {} } });
  assert.equal(result.state.adults, 0);
  assert.equal(result.state.children, 2);
  assert.equal(result.state.childFactor, 0.3);
  assert.equal(result.state.margin, 30);
  assert.equal(result.state.store, 'jumbo');
  assert.equal(result.state.stock.panCompleto, 2);
  assert.equal(result.state.meals.completos.variant, 'italiano');
  assert.ok(Number.isFinite(result.total));
  assert.equal(result.items.length, 0);
});

test('cada variante del catálogo produce cantidades válidas y formatos enteros', () => {
  for (const food of D.foods) for (const variant of Object.keys(food.variants)) {
    const result = C.calculate(base({ adults: 8, children: 3, margin: 15, roundPackages: true, meals: { [food.id]: { variant, portion: food.portion, share: 100 } } }));
    assert.ok(result.items.length > 0, `${food.id}/${variant}`);
    assert.ok(result.total > 0);
    for (const row of result.items) {
      assert.ok(Number.isFinite(row.required) && row.required > 0);
      assert.ok(Number.isInteger(row.packs));
      assert.ok(row.buy + 0.000001 >= row.required);
    }
  }
});

test('los enlaces mantienen HTTPS y codifican el término de búsqueda', () => {
  const url = new URL(C.storeUrl('jumbo', 'pan & palta'));
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'www.jumbo.cl');
  assert.equal(url.searchParams.get('ft'), 'pan & palta');
  assert.equal(C.storeUrl('mercadolibre', 'Limón malla'), 'https://listado.mercadolibre.cl/Limon-malla');
});

test('la lista exportable incluye cantidades, total y condición de los precios', () => {
  const text = C.listText(C.calculate(base()));
  assert.ok(text.includes('Pan de completo: comprar 20 un.'));
  assert.ok(text.includes('Total estimado:'));
  assert.ok(text.includes('Precios de ejemplo en CLP'));
});

test('el redondeo tolera errores binarios sin agregar un paquete fantasma', () => {
  assert.equal(C.roundUp((0.1 + 0.2) / 0.1), 3);
  assert.equal(C.roundUp(0), 0);
  assert.equal(C.roundUp(8, 8), 8);
});
