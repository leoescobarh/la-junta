import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const data = require('../dist/data.js');
const html = readFileSync(resolve(root, 'dist/index.html'), 'utf8');
for (const file of ['data.js', 'prices-snapshot.js', 'pricing.js', 'calculator.js', 'app.js']) {
  const check = spawnSync(process.execPath, ['--check', resolve(root, 'dist', file)], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
}
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
assert.equal(new Set(ids).size, ids.length, 'IDs HTML duplicados');
const localLinks = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(m => m[1]);
for (const link of localLinks) {
  if (link.startsWith('#')) assert.ok(ids.includes(link.slice(1)), `Ancla ausente: ${link}`);
  else if (!/^(https?:|data:)/.test(link)) assert.ok(existsSync(resolve(root, 'dist', link)), `Archivo ausente: ${link}`);
}
const app = readFileSync(resolve(root, 'dist/app.js'), 'utf8');
for (const match of app.matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.includes(match[1]), `Control HTML ausente: ${match[1]}`);
assert.ok(html.includes('lang="es-CL"'));
assert.ok(html.includes('name="viewport"'));
assert.ok(html.indexOf('src="data.js"') < html.indexOf('src="calculator.js"'));
assert.ok(html.indexOf('src="data.js"') < html.indexOf('src="pricing.js"'));
assert.ok(html.indexOf('src="pricing.js"') < html.indexOf('src="app.js"'));
assert.ok(html.indexOf('src="prices-snapshot.js"') < html.indexOf('src="app.js"'));
assert.ok(html.indexOf('src="calculator.js"') < html.indexOf('src="app.js"'));
for (const food of data.foods) for (const variant of Object.values(food.variants)) for (const [key, amount] of Object.entries(variant.items)) {
  assert.ok(data.ingredients[key], `Ingrediente desconocido: ${key}`);
  assert.ok(Number.isFinite(amount) && amount > 0);
}
for (const item of Object.values(data.ingredients)) {
  assert.ok(item.pack > 0 && item.price >= 0);
  assert.ok(data.groups.includes(item.group));
}
// Comprueba también la distribución UMD usada por scripts clásicos sin módulos.
const context = vm.createContext({ Intl, URL });
vm.runInContext(readFileSync(resolve(root, 'dist/data.js'), 'utf8'), context);
vm.runInContext(readFileSync(resolve(root, 'dist/pricing.js'), 'utf8'), context);
vm.runInContext(readFileSync(resolve(root, 'dist/prices-snapshot.js'), 'utf8'), context);
vm.runInContext(readFileSync(resolve(root, 'dist/calculator.js'), 'utf8'), context);
const snapshot = JSON.parse(readFileSync(resolve(root, 'dist/prices.json'), 'utf8'));
assert.equal(JSON.stringify(context.JuntaPriceSnapshot), JSON.stringify(snapshot), 'Snapshot local distinto del JSON público');
assert.equal(snapshot.schemaVersion, 1);
const sources = JSON.parse(readFileSync(resolve(root, 'pricing/sources.json'), 'utf8'));
for (const [storeId, store] of Object.entries(sources.stores)) {
  assert.ok(data.stores[storeId], `Tienda desconocida: ${storeId}`);
  for (const product of store.products) {
    assert.equal(data.ingredients[product.ingredient]?.unit, product.unit, `Unidad incompatible: ${product.ingredient}`);
    assert.ok(data.stores[storeId].productHosts.includes(new URL(product.product_url || store.search_url).hostname));
  }
}
assert.ok(context.JuntaPricing.resolve(context.JuntaPriceSnapshot, 'jumbo'));
assert.ok(context.JuntaCalculator.calculate(context.JuntaCalculator.defaultState()).total > 0);
console.log(`OK: JavaScript, rutas y archivos locales, ${ids.length} IDs, ${data.foods.length} comidas y catálogo verificados.`);
