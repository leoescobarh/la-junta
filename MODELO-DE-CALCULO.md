# Modelo de cálculo

## Entradas

| Variable | Significado | Valor inicial |
| --- | --- | --- |
| Adultos | Personas con porción adulta | 8 |
| Niños | Personas con porción infantil | 2 |
| Factor infantil | Fracción de la porción adulta | 0,6 |
| Apetito | Multiplicador: 0,8 / 1 / 1,25 | 1 |
| Margen | Porcentaje adicional | 10 % |
| Participación por comida | Fracción del grupo que comerá esa opción | 100 % |
| Porción | Unidades, gramos de base o litros por adulto/persona | Según comida |

## Fórmula

```text
equivalentes = adultos + niños × factorInfantil
porciones = equivalentes × participación / 100 × porción × apetito × (1 + margen / 100)
```

Los alimentos por unidad se redondean hacia arriba antes de multiplicar los ingredientes de la receta. Las pizzas se redondean a lotes de 8 porciones para mantener pizzas completas.

Para bebidas se utiliza `adultos + niños`, sin factor infantil ni factor de apetito. Se mantiene la participación y el margen elegido. La variante de bebida se reparte entre sus líquidos; el hielo se agrega por separado y no se cuenta como litros bebibles.

Cada comida tiene su propio porcentaje. Dos platos al 100 % representan dos preparaciones completas para el grupo. Si son alternativas, el botón de reparto asigna porcentajes enteros que suman exactamente 100 %. Los redondeos de unidades pueden generar pequeñas diferencias respecto del reparto teórico.

## Unidades de recetas

Las cantidades de cada ingrediente en `variants.items` siempre se expresan en **kg, L o unidades**, según su ficha.

- `basis: 'units'`: cantidades por cada completo, taco, hamburguesa, etc.
- `basis: 'grams'`: cantidades por cada kilogramo de la base del plato. El motor divide los gramos calculados entre 1.000 antes de aplicar la receta.
- `basis: 'liters'`: cantidades por litro de bebida.

En asado, 400 g representa el total de carne cruda deshuesada por adulto. La parrilla mixta reparte ese peso en 60 % vacuno, 30 % pollo y 10 % chorizo; agrega pan, sal y carbón. El carbón es un supuesto de 1,25 kg por kg de carne, ajustable en el catálogo, que no modela tipo de parrilla ni duración.

En pastas y arroz se usa el peso **seco**. Al seleccionar arroz en la interfaz, la base inicial cambia a 75 g por adulto; al elegir otro acompañamiento vuelve a 200 g.

La palta convierte pulpa a peso de compra con rendimiento de 70 %: 80 g de pulpa requieren aproximadamente 114,3 g de palta entera. Las otras verduras se estiman por peso de compra, sin ajuste independiente por cáscaras o limpieza. Son supuestos editables, no mediciones universales.

## Consolidación y compras

1. Sumar todos los ingredientes con el mismo identificador, aun si provienen de comidas distintas.
2. Redondear el resultado al gramo/mililitro superior, o a una unidad entera en artículos contables.
3. Restar el stock: `faltante = max(0, requerido - stock)`.
4. Con redondeo de envases: `envases = ceil(faltante / formato)`; `compra = envases × formato`.
5. Sin redondeo: comprar el faltante exacto y calcular el valor proporcional al formato de referencia. En productos envasados esto representa una estimación proporcional, no la promesa de que la tienda venda fracciones del envase.
6. Calcular el costo por ingrediente y redondearlo a pesos enteros; sumar estos costos para que la lista y el total coincidan.

El costo por persona se divide por el número real de asistentes, incluidos niños. Con cero invitados, todos los costos y cantidades son cero.

El estado «listo» no reduce lo necesario para la receta ni el presupuesto total. Solo reduce el monto pendiente. Un ingrediente cubierto completamente por el stock se considera listo automáticamente.

## Ejemplo inicial verificable

Este ejemplo usa exclusivamente los formatos y precios de ejemplo. Con precios de tienda activos, el formato y el costo pueden cambiar.

8 adultos + 2 niños al 60 % = 9,2 comensales equivalentes.

2 completos por adulto, apetito normal y 10 % extra = 20,24 completos, que se redondean a **21**.

| Ingrediente | Necesario | Compra con formatos iniciales |
| --- | --- | --- |
| Pan de completo | 21 unidades | 24 unidades, 3 paquetes de 8 |
| Vienesas | 21 unidades | 30 unidades, 3 paquetes de 10 |
| Tomate | 1,68 kg | 2 kg |
| Palta entera | 2,4 kg | 2,5 kg |
| Mayonesa | 525 g | 1 kg, 2 formatos de 500 g |

Con los precios de **ejemplo** del catálogo, ese escenario suma $37.300, o $3.730 por asistente. No es una cotización de supermercado.

## Precio y formato de la tienda

`pricing.js` valida cada resultado antes de entregarlo al motor: moneda CLP, importe positivo, unidad compatible, formato válido, enlace HTTPS a la tienda y fecha de consulta. `calculate(estado, preciosValidados)` sustituye tanto el precio como el formato del ingrediente. No modifica las cantidades de la receta.

Para 21 vienesas, un paquete de 20 unidades genera una compra de 40, en dos paquetes. Con el formato de ejemplo de 10 genera 30, en tres paquetes. Usar el precio de 20 unidades sobre el formato de 10 produciría un presupuesto incorrecto.

La prioridad es: precio editado por el visitante; precio válido de tienda reciente o anterior con etiqueta; precio de ejemplo. Un resultado sin stock no se usa como oferta comprable. A las 24 horas, o después de una consulta fallida, el último precio se presenta como anterior con su fecha original. El total puede combinar fuentes; la interfaz muestra cuántos ingredientes corresponden a cada una. No se calcula un mínimo entre supermercados ni un historial de precios en esta versión.

## Añadir una comida

Agrega una entrada en `foods` dentro de `dist/data.js`, usando un identificador único y estable:

```js
{
  id: 'tapaditos',
  name: 'Tapaditos',
  emoji: '🥪',
  description: 'Para el cóctel',
  group: 'snack',
  unit: 'tapaditos',
  portionLabel: 'Tapaditos por adulto',
  basis: 'units',
  min: 1, max: 12, step: 1, portion: 4,
  variants: {
    queso: recipe('Jamón y queso', {
      panTapadito: 1,
      jamon: 0.015,
      queso: 0.015
    })
  }
}
```

También debes definir `panTapadito` en `ingredients`, con su nombre, grupo, unidad, formato, precio y término de búsqueda. Los controles, la lista y los cálculos se generan desde el catálogo. No agregues HTML por cada receta nueva.

Para añadir un filtro nuevo, agrega su identificador en `filters` y asigna ese mismo `group` a las comidas correspondientes. Los grupos de ingredientes son independientes y se ordenan con `groups`.

## Validación incluida

Las pruebas comprueban cantidades conocidas y casos límite, incluida la consolidación previa al redondeo, la merma de palta, el cálculo distinto de bebidas, las pizzas completas y las entradas inválidas. Para volver a ejecutarlas:

```sh
node --test tests/calculator.test.cjs
```
