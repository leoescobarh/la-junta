/* Catálogo editable. Los precios son EJEMPLOS en CLP por formato de venta.
   Cantidades: kg, L o unidades. pricing.js aplica los precios publicados por el actualizador. */
(function (root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.JuntaData = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const ingredients = {
    panCompleto: { name: 'Pan de completo', group: 'Panadería', unit: 'un', pack: 8, price: 2400, query: 'pan hot dog completo' },
    vienesa: { name: 'Vienesas', group: 'Carnes y proteínas', unit: 'un', pack: 10, price: 2800, query: 'vienesas' },
    vienesaVeg: { name: 'Vienesas vegetales', group: 'Carnes y proteínas', unit: 'un', pack: 5, price: 3500, query: 'vienesas vegetales' },
    palta: { name: 'Palta entera', group: 'Frutas y verduras', unit: 'kg', pack: 0.5, price: 2500, query: 'palta hass' },
    tomate: { name: 'Tomate', group: 'Frutas y verduras', unit: 'kg', pack: 0.5, price: 1000, query: 'tomate' },
    mayo: { name: 'Mayonesa', group: 'Salsas y despensa', unit: 'kg', pack: 0.5, price: 2600, query: 'mayonesa 500 g' },
    mayoVeg: { name: 'Mayonesa vegana', group: 'Salsas y despensa', unit: 'kg', pack: 0.35, price: 3200, query: 'mayonesa vegana' },
    ketchup: { name: 'Kétchup', group: 'Salsas y despensa', unit: 'kg', pack: 0.25, price: 1300, query: 'ketchup' },
    mostaza: { name: 'Mostaza', group: 'Salsas y despensa', unit: 'kg', pack: 0.25, price: 1200, query: 'mostaza' },
    chucrut: { name: 'Chucrut', group: 'Salsas y despensa', unit: 'kg', pack: 0.5, price: 2000, query: 'chucrut' },
    vacuno: { name: 'Vacuno para asado', group: 'Carnes y proteínas', unit: 'kg', pack: 0.5, price: 6500, query: 'carne vacuno parrilla' },
    pollo: { name: 'Pollo deshuesado', group: 'Carnes y proteínas', unit: 'kg', pack: 0.5, price: 3000, query: 'pollo deshuesado' },
    chorizo: { name: 'Chorizos', group: 'Carnes y proteínas', unit: 'kg', pack: 0.5, price: 3500, query: 'chorizos' },
    carbon: { name: 'Carbón', group: 'Parrilla', unit: 'kg', pack: 2.5, price: 5000, query: 'carbon parrilla' },
    sal: { name: 'Sal', group: 'Salsas y despensa', unit: 'kg', pack: 1, price: 900, query: 'sal' },
    panMarraqueta: { name: 'Marraqueta', group: 'Panadería', unit: 'kg', pack: 0.5, price: 1100, query: 'pan marraqueta' },
    panSandwich: { name: 'Pan de sándwich', group: 'Panadería', unit: 'un', pack: 6, price: 2400, query: 'pan frica sandwich' },
    churrasco: { name: 'Carne para churrasco', group: 'Carnes y proteínas', unit: 'kg', pack: 0.5, price: 6000, query: 'churrasco vacuno' },
    jamon: { name: 'Jamón', group: 'Carnes y proteínas', unit: 'kg', pack: 0.25, price: 2500, query: 'jamon laminado' },
    queso: { name: 'Queso gauda', group: 'Lácteos y refrigerados', unit: 'kg', pack: 0.25, price: 2600, query: 'queso gauda' },
    panBurger: { name: 'Pan de hamburguesa', group: 'Panadería', unit: 'un', pack: 6, price: 2500, query: 'pan hamburguesa' },
    burger: { name: 'Hamburguesas de vacuno', group: 'Carnes y proteínas', unit: 'un', pack: 4, price: 4000, query: 'hamburguesas vacuno' },
    burgerVeg: { name: 'Hamburguesas vegetales', group: 'Carnes y proteínas', unit: 'un', pack: 4, price: 4200, query: 'hamburguesas vegetales' },
    lechuga: { name: 'Lechuga', group: 'Frutas y verduras', unit: 'kg', pack: 0.2, price: 1200, query: 'lechuga' },
    pizzaBase: { name: 'Base de pizza (8 porciones)', group: 'Panadería', unit: 'un', pack: 2, price: 3000, query: 'masa pizza familiar' },
    mozzarella: { name: 'Queso mozzarella', group: 'Lácteos y refrigerados', unit: 'kg', pack: 0.25, price: 3000, query: 'queso mozzarella' },
    salsaTomate: { name: 'Salsa de tomate', group: 'Salsas y despensa', unit: 'kg', pack: 0.2, price: 700, query: 'salsa tomate' },
    pepperoni: { name: 'Pepperoni', group: 'Carnes y proteínas', unit: 'kg', pack: 0.1, price: 2200, query: 'pepperoni' },
    champinon: { name: 'Champiñones', group: 'Frutas y verduras', unit: 'kg', pack: 0.2, price: 1800, query: 'champinones' },
    tortilla: { name: 'Tortillas para tacos', group: 'Panadería', unit: 'un', pack: 8, price: 2200, query: 'tortillas mexicanas' },
    carneMolida: { name: 'Carne molida', group: 'Carnes y proteínas', unit: 'kg', pack: 0.5, price: 4300, query: 'carne molida' },
    porotos: { name: 'Porotos cocidos (peso drenado)', group: 'Salsas y despensa', unit: 'kg', pack: 0.4, price: 1500, query: 'porotos negros cocidos' },
    pimenton: { name: 'Pimentón', group: 'Frutas y verduras', unit: 'kg', pack: 0.25, price: 1000, query: 'pimenton' },
    cebolla: { name: 'Cebolla', group: 'Frutas y verduras', unit: 'kg', pack: 0.5, price: 750, query: 'cebolla' },
    papasChips: { name: 'Papas fritas de bolsa', group: 'Picoteo', unit: 'kg', pack: 0.25, price: 2000, query: 'papas fritas 250 g' },
    nachos: { name: 'Nachos', group: 'Picoteo', unit: 'kg', pack: 0.2, price: 1900, query: 'nachos' },
    frutosSecos: { name: 'Mix de frutos secos', group: 'Picoteo', unit: 'kg', pack: 0.25, price: 2800, query: 'mix frutos secos' },
    hummus: { name: 'Hummus', group: 'Lácteos y refrigerados', unit: 'kg', pack: 0.2, price: 2200, query: 'hummus' },
    galletaSalada: { name: 'Galletas saladas', group: 'Picoteo', unit: 'kg', pack: 0.2, price: 1700, query: 'galletas saladas' },
    pepino: { name: 'Pepino', group: 'Frutas y verduras', unit: 'kg', pack: 0.5, price: 900, query: 'pepino ensalada' },
    papa: { name: 'Papas', group: 'Frutas y verduras', unit: 'kg', pack: 1, price: 1400, query: 'papas' },
    limon: { name: 'Limón', group: 'Frutas y verduras', unit: 'kg', pack: 0.5, price: 1100, query: 'limon' },
    aceite: { name: 'Aceite', group: 'Salsas y despensa', unit: 'L', pack: 1, price: 2400, query: 'aceite vegetal' },
    arroz: { name: 'Arroz crudo', group: 'Salsas y despensa', unit: 'kg', pack: 1, price: 1600, query: 'arroz' },
    pasta: { name: 'Pasta seca', group: 'Salsas y despensa', unit: 'kg', pack: 0.4, price: 1100, query: 'pasta tallarines' },
    parmesano: { name: 'Queso rallado', group: 'Lácteos y refrigerados', unit: 'kg', pack: 0.08, price: 1300, query: 'queso rallado' },
    pesto: { name: 'Pesto', group: 'Salsas y despensa', unit: 'kg', pack: 0.19, price: 3000, query: 'pesto' },
    zapallo: { name: 'Zapallo italiano', group: 'Frutas y verduras', unit: 'kg', pack: 0.5, price: 1100, query: 'zapallo italiano' },
    brocheta: { name: 'Palitos de brocheta', group: 'Parrilla', unit: 'un', pack: 50, price: 1200, query: 'palitos brochetas' },
    bebida: { name: 'Bebida o jugo', group: 'Bebidas', unit: 'L', pack: 2, price: 2200, query: 'bebida 2 litros' },
    agua: { name: 'Agua', group: 'Bebidas', unit: 'L', pack: 1.5, price: 900, query: 'agua mineral 1.5 litros' },
    hielo: { name: 'Hielo', group: 'Bebidas', unit: 'kg', pack: 2, price: 1800, query: 'hielo 2 kg' },
    helado: { name: 'Helado', group: 'Lácteos y refrigerados', unit: 'L', pack: 1, price: 3500, query: 'helado 1 litro' },
    fruta: { name: 'Fruta de estación', group: 'Frutas y verduras', unit: 'kg', pack: 0.5, price: 1200, query: 'fruta' },
    brownie: { name: 'Brownie individual', group: 'Panadería', unit: 'un', pack: 6, price: 4500, query: 'brownie' }
  };
  const recipe = (name, items, note) => ({ name, items, note: note || '' });
  const foods = [
    { id: 'completos', name: 'Completos', emoji: '🌭', description: 'El clásico de la junta', group: 'main', unit: 'completos', portionLabel: 'Completos por adulto', basis: 'units', min: 0.5, max: 5, step: 0.5, portion: 2,
      variants: {
        italiano: recipe('Italianos', { panCompleto: 1, vienesa: 1, tomate: 0.08, palta: 0.08 / 0.7, mayo: 0.025 }, '80 g de pulpa de palta por completo; se considera 70 % de rendimiento de la palta entera.'),
        clasico: recipe('Clásicos con chucrut', { panCompleto: 1, vienesa: 1, tomate: 0.08, chucrut: 0.05, mayo: 0.025, mostaza: 0.01 }),
        dinamico: recipe('Dinámicos', { panCompleto: 1, vienesa: 1, tomate: 0.06, palta: 0.06 / 0.7, chucrut: 0.04, mayo: 0.025 }),
        veggie: recipe('Italianos vegetales', { panCompleto: 1, vienesaVeg: 1, tomate: 0.08, palta: 0.08 / 0.7, mayoVeg: 0.025 })
      } },
    { id: 'asado', name: 'Asado', emoji: '🥩', description: 'Prendemos la parrilla', group: 'main', unit: 'g de carne', portionLabel: 'Gramos de carne cruda por adulto', basis: 'grams', min: 150, max: 800, step: 50, portion: 400,
      variants: {
        mixto: recipe('Parrilla mixta', { vacuno: 0.6, pollo: 0.3, chorizo: 0.1, panMarraqueta: 0.25, carbon: 1.25, sal: 0.02 }, 'La carne se reparte en 60 % vacuno, 30 % pollo y 10 % chorizo. Incluye pan, sal y una estimación de carbón.'),
        vacuno: recipe('Solo vacuno', { vacuno: 1, panMarraqueta: 0.25, carbon: 1.25, sal: 0.02 }, 'Peso de carne cruda deshuesada. El carbón depende de tu parrilla y del tiempo de cocción.'),
        pollo: recipe('Pollo y chorizo', { pollo: 0.8, chorizo: 0.2, panMarraqueta: 0.25, carbon: 1.25, sal: 0.02 })
      } },
    { id: 'sandwiches', name: 'Sándwiches', emoji: '🥪', description: 'Bien contundentes', group: 'main', unit: 'sándwiches', portionLabel: 'Sándwiches por adulto', basis: 'units', min: 0.5, max: 4, step: 0.5, portion: 1.5,
      variants: {
        churrasco: recipe('Churrasco italiano', { panSandwich: 1, churrasco: 0.15, palta: 0.06 / 0.7, tomate: 0.06, mayo: 0.02 }),
        ave: recipe('Ave palta', { panSandwich: 1, pollo: 0.15, palta: 0.06 / 0.7, mayo: 0.02 }),
        jamon: recipe('Jamón y queso', { panSandwich: 1, jamon: 0.05, queso: 0.05, mayo: 0.015 }),
        veggie: recipe('Hummus y vegetales', { panSandwich: 1, hummus: 0.06, tomate: 0.06, palta: 0.05 / 0.7, lechuga: 0.02 })
      } },
    { id: 'burgers', name: 'Hamburguesas', emoji: '🍔', description: 'Arma tu favorita', group: 'main', unit: 'hamburguesas', portionLabel: 'Hamburguesas por adulto', basis: 'units', min: 0.5, max: 4, step: 0.5, portion: 1.5,
      variants: {
        clasica: recipe('Clásicas con queso', { panBurger: 1, burger: 1, queso: 0.03, tomate: 0.04, lechuga: 0.02, ketchup: 0.015, mayo: 0.015 }),
        doble: recipe('Doble queso', { panBurger: 1, burger: 2, queso: 0.05, ketchup: 0.02, mayo: 0.015 }),
        veggie: recipe('Vegetales', { panBurger: 1, burgerVeg: 1, palta: 0.05 / 0.7, tomate: 0.04, lechuga: 0.02, mayoVeg: 0.015 })
      } },
    { id: 'pizza', name: 'Pizzas', emoji: '🍕', description: 'Una porción más', group: 'main', unit: 'porciones de pizza', portionLabel: 'Porciones de pizza por adulto', basis: 'units', min: 1, max: 8, step: 1, portion: 3, batch: 8,
      variants: {
        queso: recipe('Queso y tomate', { pizzaBase: 1 / 8, mozzarella: 0.035, salsaTomate: 0.02, tomate: 0.015 }, '8 porciones por pizza familiar. La preparación se redondea siempre a pizzas completas.'),
        pepperoni: recipe('Pepperoni', { pizzaBase: 1 / 8, mozzarella: 0.035, salsaTomate: 0.02, pepperoni: 0.015 }),
        veggie: recipe('Champiñón y pimentón', { pizzaBase: 1 / 8, mozzarella: 0.035, salsaTomate: 0.02, champinon: 0.02, pimenton: 0.015 })
      } },
    { id: 'tacos', name: 'Tacos', emoji: '🌮', description: 'Para compartir al centro', group: 'main', unit: 'tacos', portionLabel: 'Tacos por adulto', basis: 'units', min: 1, max: 8, step: 1, portion: 3,
      variants: {
        carne: recipe('Carne y guacamole', { tortilla: 1, carneMolida: 0.06, palta: 0.03 / 0.7, tomate: 0.025, cebolla: 0.015, queso: 0.02 }),
        pollo: recipe('Pollo y pimentón', { tortilla: 1, pollo: 0.06, pimenton: 0.025, cebolla: 0.015, palta: 0.025 / 0.7 }),
        veggie: recipe('Porotos y vegetales', { tortilla: 1, porotos: 0.065, palta: 0.03 / 0.7, tomate: 0.025, cebolla: 0.015 })
      } },
    { id: 'snacks', name: 'Picoteo', emoji: '🍿', description: 'Mientras llega el resto', group: 'snack', unit: 'g de picoteo', portionLabel: 'Gramos de picoteo por adulto', basis: 'grams', min: 30, max: 250, step: 10, portion: 80,
      variants: {
        clasico: recipe('Papas, nachos y frutos secos', { papasChips: 0.4, nachos: 0.3, frutosSecos: 0.3 }, 'Pensado como aperitivo. Puedes subir la porción si el picoteo será la comida principal.'),
        tabla: recipe('Tabla de queso y galletas', { queso: 0.4, galletaSalada: 0.35, frutosSecos: 0.25 }),
        hummus: recipe('Hummus y verduras', { hummus: 0.4, pepino: 0.3, galletaSalada: 0.3 })
      } },
    { id: 'sides', name: 'Acompañamientos', emoji: '🥗', description: 'La dupla perfecta', group: 'side', unit: 'g de acompañamiento', portionLabel: 'Gramos de base por adulto', basis: 'grams', min: 50, max: 400, step: 25, portion: 200,
      variants: {
        chilena: recipe('Ensalada chilena', { tomate: 0.8, cebolla: 0.2, aceite: 0.04, sal: 0.005 }),
        verde: recipe('Ensalada verde', { lechuga: 0.4, pepino: 0.4, palta: 0.2 / 0.7, limon: 0.08, aceite: 0.04 }),
        papas: recipe('Papas mayo', { papa: 1, mayo: 0.12, sal: 0.005 }),
        arroz: recipe('Arroz', { arroz: 1, sal: 0.01, aceite: 0.03 }, 'Peso de arroz seco. Como acompañamiento, puedes usar 75–100 g por adulto antes del margen.')
      } },
    { id: 'pastas', name: 'Pastas', emoji: '🍝', description: 'Siempre una buena idea', group: 'main', unit: 'g de pasta seca', portionLabel: 'Gramos de pasta seca por adulto', basis: 'grams', min: 50, max: 200, step: 25, portion: 100,
      variants: {
        bolonesa: recipe('Boloñesa', { pasta: 1, carneMolida: 0.8, salsaTomate: 1.2, cebolla: 0.2, parmesano: 0.1 }),
        tomate: recipe('Salsa de tomate', { pasta: 1, salsaTomate: 1.5, parmesano: 0.1 }),
        pesto: recipe('Pesto', { pasta: 1, pesto: 0.45, parmesano: 0.1 })
      } },
    { id: 'veggies', name: 'Parrilla veggie', emoji: '🫑', description: 'También tienen su lugar', group: 'main', unit: 'brochetas', portionLabel: 'Brochetas por adulto', basis: 'units', min: 1, max: 6, step: 1, portion: 3,
      variants: {
        brochetas: recipe('Brochetas de verduras', { zapallo: 0.06, champinon: 0.04, pimenton: 0.04, cebolla: 0.025, brocheta: 1, aceite: 0.008 }, 'Verduras como plato principal. El carbón se calcula con el asado; si solo harás verduras, considera el combustible de tu parrilla por separado.'),
        rellenos: recipe('Brochetas con queso', { zapallo: 0.05, champinon: 0.04, pimenton: 0.04, queso: 0.035, brocheta: 1, aceite: 0.008 })
      } },
    { id: 'drinks', name: 'Bebidas', emoji: '🥤', description: 'Algo fresquito', group: 'extra', unit: 'L de bebida', portionLabel: 'Litros por persona', basis: 'liters', min: 0.25, max: 2, step: 0.25, portion: 0.75, actualGuests: true,
      variants: {
        mixto: recipe('Bebida, agua y hielo', { bebida: 0.6, agua: 0.4, hielo: 0.25 }, 'Incluye la misma cantidad de líquido por adulto y niño; sin factor de hambre. Ajusta según duración y temperatura.'),
        agua: recipe('Agua y hielo', { agua: 1, hielo: 0.25 }),
        bebida: recipe('Solo bebida o jugo', { bebida: 1 })
      } },
    { id: 'dessert', name: 'Postres', emoji: '🍨', description: 'Siempre queda espacio', group: 'extra', unit: 'porciones de postre', portionLabel: 'Porciones por adulto', basis: 'units', min: 0.5, max: 3, step: 0.5, portion: 1,
      variants: {
        helado: recipe('Helado', { helado: 0.15 }),
        fruta: recipe('Fruta', { fruta: 0.2 }),
        brownie: recipe('Brownie con helado', { brownie: 1, helado: 0.1 })
      } }
  ];
  return {
    version: '2.0.0', ingredients, foods,
    groups: ['Panadería', 'Carnes y proteínas', 'Frutas y verduras', 'Lácteos y refrigerados', 'Salsas y despensa', 'Picoteo', 'Bebidas', 'Parrilla'],
    filters: [{ id: 'all', name: 'Todo' }, { id: 'main', name: 'Principales' }, { id: 'snack', name: 'Picoteo' }, { id: 'side', name: 'Acompañar' }, { id: 'extra', name: 'Bebidas y postres' }],
    stores: {
      jumbo: { name: 'Jumbo', url: 'https://www.jumbo.cl/busqueda?ft=', productHosts: ['www.jumbo.cl', 'jumbo.cl'] },
      lider: { name: 'Lider', url: 'https://super.lider.cl/search?q=', productHosts: ['super.lider.cl'] },
      tottus: { name: 'Tottus', url: 'https://www.tottus.cl/tottus-cl/search?Ntt=', productHosts: ['www.tottus.cl', 'tottus.cl'] },
      unimarc: { name: 'Unimarc', url: 'https://www.unimarc.cl/search?q=', productHosts: ['www.unimarc.cl', 'unimarc.cl'] },
      santaIsabel: { name: 'Santa Isabel', url: 'https://www.santaisabel.cl/busqueda?ft=', productHosts: ['www.santaisabel.cl', 'santaisabel.cl'] },
      mercadolibre: { name: 'Mercado Libre', url: 'https://listado.mercadolibre.cl/', productHosts: ['www.mercadolibre.cl', 'articulo.mercadolibre.cl'] }
    }
  };
});
