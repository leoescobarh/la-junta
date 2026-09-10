# La Junta · Calculadora de comidas · v2.0

Proyecto web completo en español, pensado para organizar comidas en Chile. Diseño adaptable a computador, tablet y celular, con cálculos inmediatos y lista de compras.

## Estado del proyecto en GitHub

La columna **Tienda** muestra los supermercados por ingrediente, sin seleccionar una tienda para toda la compra. El presupuesto toma el menor costo consultado vigente para la cantidad pendiente, descontando stock y considerando envases completos. Las marcas pueden diferir: cada oferta indica su producto, formato y precio por kg, litro o unidad. Los precios anteriores se muestran como referencia y no compiten como vigentes.

El actualizador consulta Jumbo, Santa Isabel, Lider, Tottus y Unimarc. Se verificó una primera ejecución real con cinco precios de Jumbo extraídos del HTML. Las fuentes tienen cobertura parcial: una configuración no garantiza extracción, y las páginas pueden bloquearla o requerir JavaScript. Consulta [SUPERMERCADOS.md](SUPERMERCADOS.md) y los estados publicados en `dist/prices.json`.

Para conectar el sitio existente de Netlify, vincula este repositorio y selecciona la rama `main`, la base del proyecto vacía, ningún comando de compilación y `dist` como carpeta de publicación. `dist/index.html` ya está incluido en el repositorio. No subas el ZIP como si fuera código fuente.

El workflow «Actualizar precios de La Junta» permite una ejecución manual desde Actions y tiene un horario cada seis horas. Una vez vinculado Netlify al repositorio, los cambios publicados en `dist` podrán generar nuevos despliegues. Una ejecución terminada no garantiza precios obtenidos: revisa los estados y fechas en `dist/prices.json`.

## Abrir ahora

1. Descomprime el ZIP completo.
2. Abre `ABRIR.html`, o directamente `dist/index.html`, en tu navegador.
3. Cambia los invitados y selecciona las comidas.

La aplicación funciona con HTML, CSS y JavaScript, sin instalar dependencias. Todos los recursos visuales están incluidos. Puedes usar el cálculo sin conexión después de descargar el proyecto; los enlaces de tiendas requieren internet.

## Subir a tu hosting

Sube **el contenido de `dist/`** a la carpeta pública de tu hosting. `index.html` debe quedar en la raíz que quieras publicar, junto a los archivos JavaScript, `styles.css` y `assets/`.

Por ejemplo, si tu hosting usa `public_html`, coloca allí el contenido de `dist`. También puedes usar una subcarpeta como `public_html/calculadora`: todas las rutas internas son relativas.

Hay instrucciones adicionales en [GUIA-PUBLICACION.md](GUIA-PUBLICACION.md). El proyecto incluye configuración para Netlify.

## Qué incluye

- 12 tipos de comida: completos, asados, sándwiches, hamburguesas, pizzas, tacos, picoteo, acompañamientos, pastas, parrilla vegetariana, bebidas y postres.
- Variantes dentro de cada comida, incluidas preparaciones con ingredientes vegetales.
- Adultos y niños con porción infantil ajustable.
- Apetito suave, normal o abundante y margen extra de 0 a 30 %.
- Porciones y porcentaje de participación independiente por comida.
- Reparto de platos principales cuando se ofrecen como alternativas.
- Ingredientes compartidos consolidados en una sola lista.
- Redondeo opcional a formatos de compra completos.
- Descuento del stock que ya tienes, precios editables y total por persona.
- Lista que puedes marcar, copiar, descargar como TXT e imprimir o guardar como PDF desde el navegador.
- Fichas de productos de Jumbo y búsquedas de ingredientes en Jumbo y Mercado Libre.
- Actualizador de precios en Python: primero VTEX público; si no hay información utilizable, extracción del HTML mediante JSON-LD, metadatos o selectores configurables.
- Precio y formato del producto real, fecha de consulta y etiquetas para precios anteriores, editados o de ejemplo.
- Automatización cada seis horas mediante cron o el workflow incluido para GitHub Actions.
- Controles accesibles mediante teclado, etiquetas para lectores de pantalla y respeto de la preferencia de movimiento reducido.

## Archivos para editar

| Archivo | Contenido |
| --- | --- |
| `dist/index.html` | Estructura de la página, textos generales y diálogos |
| `dist/styles.css` | Diseño, colores, tamaños, adaptación móvil e impresión |
| `dist/data.js` | Comidas, variantes, ingredientes, formatos, precios de ejemplo y tiendas |
| `dist/calculator.js` | Motor de cantidades, consolidación, presupuesto y exportación |
| `dist/app.js` | Interacciones, controles y presentación de resultados |
| `dist/pricing.js` | Validación, antigüedad y cobertura de precios de tiendas |
| `dist/prices.json` | Últimos resultados publicados por el actualizador |
| `dist/prices-snapshot.js` | Copia para abrir la web directamente como archivo local |
| `dist/assets/` | Fotografía y favicon incluidos |
| `pricing/sync_prices.py` | Consulta VTEX, extracción HTML y conservación de precios anteriores |
| `pricing/sources.json` | Tiendas, productos exactos, formatos y reglas de coincidencia |
| `.github/workflows/update-prices.yml` | Ejecución programada y publicación de los archivos de precios en tu repositorio |
| `tests/` | Pruebas de cálculo y actualización sin consultas a tiendas |
| `scripts/check.mjs` | Validación de JavaScript, referencias y catálogo |
| `netlify.toml` | Carpeta de publicación y cabeceras para Netlify |

Los archivos de `dist` son **el código fuente legible y la versión publicable**. No hay un paso de compilación ni una copia minificada que debas reconstruir.

## Personalización rápida

Para cambiar colores, modifica las variables del comienzo de `dist/styles.css`, especialmente `--orange`, `--ink`, `--background` y `--radius`.

Para cambiar un precio o un envase por defecto, edita el ingrediente correspondiente en `dist/data.js`:

```js
panCompleto: {
  name: 'Pan de completo',
  group: 'Panadería',
  unit: 'un',
  pack: 8,
  price: 2400,
  query: 'pan hot dog completo'
}
```

`pack` es la cantidad por formato de venta; `price` es el precio **del formato completo**, en pesos chilenos. Los pesos se expresan en kg, los líquidos en L y los artículos contables en `un`.

Para ajustar porciones o agregar recetas, consulta [MODELO-DE-CALCULO.md](MODELO-DE-CALCULO.md). Para cambiar las personas iniciales, edita `defaultState()` en `dist/calculator.js` y, si quieres, los valores iniciales de los controles en el HTML.

## Validación para desarrollo

Si tienes Node.js 20 o superior, desde la carpeta del proyecto ejecuta:

```sh
node scripts/check.mjs
node --test tests/*.test.cjs
python3 -m unittest discover -s tests -p 'test_*.py'
python3 pricing/sync_prices.py --validate-config
```

También están disponibles `npm run check`, `npm test` y `npm run test:prices`. **No hace falta ejecutar `npm install` ni instalar paquetes de Python.** Node solo se utiliza para las comprobaciones; Python 3.11 o superior se utiliza para actualizar precios. Ninguno es necesario para servir la web estática.

Se incluyen 30 pruebas de JavaScript y 18 de Python. Cubren el cálculo, la conversión de formatos, prioridad de fuentes, extracción HTML, datos incompletos, precios vencidos, moneda, falta de stock y conservación de fechas ante fallos. Las respuestas de tiendas en las pruebas son sintéticas. No se ejecutaron pruebas visuales en un navegador ni un despliegue en un hosting.

## Activar precios automáticos

Lee [PRECIOS-AUTOMATICOS.md](PRECIOS-AUTOMATICOS.md). El actualizador funciona fuera del navegador y publica dos archivos que consume la web:

```sh
python3 pricing/sync_prices.py
```

El catálogo configura **16 ingredientes en cinco supermercados**: cinco fichas de referencia y once búsquedas adicionales para carnes, verduras y despensa. Se exige coincidencia del nombre y formato; los productos sin coincidencia quedan sin precio. Para otras marcas o ingredientes hay que ampliar y comprobar `pricing/sources.json`. Mercado Libre no participa en la comparación de supermercados.

La primera extracción real se completó desde GitHub Actions el 10 de septiembre de 2026. Los datos publicados conservan la fecha de consulta y el enlace de la ejecución que los generó. Si no se puede obtener un precio fiable, la web indica el fallo y muestra el dato anterior como referencia, o usa una estimación etiquetada para el presupuesto.

Subir `dist` publica la calculadora. Para que los precios cambien solos también debes activar el cron o el workflow y hacer que sus dos archivos lleguen al hosting. Abrir la página o pulsar «Revisar actualización» únicamente lee el último archivo publicado; no inicia consultas a tiendas.

## Alcance de esta versión

Los precios iniciales de `data.js` son **datos de ejemplo**. Se reemplazan por la consulta de la tienda cuando hay un resultado válido. El formato cambia junto con el precio; por ejemplo, las vienesas configuradas vienen en 20 unidades, frente a las 10 del catálogo de ejemplo. Un precio manual se aplica al formato mostrado y se descarta si ese formato cambia. Los precios manuales se mantienen por tienda durante la sesión.

Los enlaces abren la ficha configurada cuando existe o una búsqueda del ingrediente. «Ver ficha» con precio de ejemplo requiere revisar el formato en la tienda. No crean carritos, no reservan stock ni compran productos. No hay afiliación con las tiendas. Las fuentes de [Jumbo](https://www.jumbo.cl/busqueda?ft=pan) se localizaron el 9 de septiembre de 2026. El enlace de Mercado Libre es una búsqueda que debe comprobarse desde un navegador habitual. Las tiendas pueden cambiar sus rutas y precios según ubicación, sesión, promociones o disponibilidad.

La planificación vive en la memoria de la pestaña y se restablece al recargar. Puedes conservar el resultado con Copiar, Descargar o Imprimir. No hay cuentas, base de datos, rastreadores, cookies de la aplicación ni claves privadas.

Cambiar invitados, menú o porciones desmarca la lista para revisar cantidades nuevas. Cambiar un precio conserva las marcas; una actualización que cambia el formato desmarca el ingrediente afectado. «Ya tengo» reduce la compra; una marca de «listo» solo reduce lo pendiente.

Las recetas son aproximaciones prácticas para planificar, no pautas nutricionales. La selección vegetal no certifica alérgenos ni composición de productos: revisa las etiquetas según lo que necesite tu grupo.

## Recursos y licencia

Código original bajo licencia MIT; consulta `LICENSE`. La fotografía fue generada para este proyecto y está incluida, sin dependencia de un servicio de imágenes externo. Los emojis usan la representación del sistema operativo. La tipografía usa fuentes del sistema, sin descargas de terceros.

El nombre «La Junta» es un nombre de trabajo para el proyecto; puedes sustituirlo en los textos, el título y el favicon.
