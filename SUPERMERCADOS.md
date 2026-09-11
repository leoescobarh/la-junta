# Consulta y comparación de supermercados

La columna **Tienda** reúne Jumbo, Santa Isabel, Lider, Tottus y Unimarc por ingrediente. Incluye precio del envase, precio normalizado por kg/L/unidad, ficha y fecha. No hay selector global de tienda.

El presupuesto compara el costo de cubrir la cantidad faltante después de descontar stock. Con redondeo activado compara envases completos; sin él compara cantidades proporcionales. Solo participan precios vigentes; un precio editado manualmente tiene prioridad. Es el menor costo entre los productos consultados, no una garantía de mínimo de todo el catálogo. Las marcas pueden diferir y no se incluye despacho.

## Servicio de extracción

| Tienda | Método configurado |
| --- | --- |
| Jumbo | API pública VTEX y HTML |
| Santa Isabel | API pública VTEX y HTML |
| Lider | HTML de `super.lider.cl` |
| Tottus | Chromium: búsqueda renderizada y verificación de fichas |
| Unimarc | Chromium: búsqueda renderizada y verificación de fichas |

El navegador se ejecuta en GitHub Actions, con una sesión anónima nueva por tienda. Espera contenido cargado mediante JavaScript. Puede descubrir enlaces desde el HTML, JSON-LD, Next.js y respuestas JSON públicas observadas en los dominios de la tienda; después verifica el precio en la ficha concreta. No consulta supermercados desde el navegador del visitante.

Se inspeccionan hasta cinco candidatos por búsqueda y se exige coincidencia de producto, presentación y moneda CLP. No se toman cuotas, mínimos de AggregateOffer ni promociones identificadas como condicionadas. El catálogo actual usa formatos explícitos. El modo opcional `measure_from_name` permite otras presentaciones solo cuando su cantidad es inequívoca; no está activado en los objetivos iniciales.

Las cinco cadenas tienen 23 ingredientes configurados cada una. Los demás ingredientes de la calculadora mantienen estimaciones identificadas mientras no se configuren fuentes. Este servicio no es un rastreo completo de cada supermercado ni de todas las cadenas de Chile. Las páginas pueden cambiar o impedir el acceso; instalar un navegador no garantiza eludir esas limitaciones.

## Continuidad y diagnóstico

El workflow corre cada dos horas, manualmente y al cambiar `pricing/` o el propio workflow en `main`. Publica JSON y JS juntos en un commit. Netlify vinculado a `main` debe desplegar esos archivos para que lleguen a la web.

Si falla una consulta, el último precio válido de la misma configuración se conserva con su fecha original y estado anterior. Si se observó falta de stock, se muestra como agotado y se mantiene el precio histórico separado. Un fallo posterior tampoco borra ese historial. Los datos anteriores no compiten como vigentes.

Cada ejecución guarda un artefacto `precios-<número>` durante 30 días: snapshot completo de los productos configurados, informe de cobertura, errores y diagnóstico de navegador por tienda. El historial de commits conserva las versiones publicadas de los precios. No se guardan cookies, cabeceras ni sesiones. `dist/prices.json` incluye `runUrl` para abrir la consulta que produjo el archivo.

Se respetan robots.txt, dominios autorizados, pausas y presupuestos de consulta. Un 401/403/429 o verificación humana detiene esa tienda durante la ejecución; el diagnóstico explica el motivo. No se usan proxies rotatorios ni resolución de CAPTCHA. Para una cadena que impida el acceso hará falta un suministro de datos autorizado por ella para asegurar cobertura estable.

`Revisar actualización` descarga el último archivo publicado. No inicia scraping en tiempo real. Consulta [las ejecuciones](https://github.com/leoescobarh/la-junta/actions/workflows/update-prices.yml) para conocer los precios realmente obtenidos: una ejecución exitosa puede tener cobertura parcial.

## Ampliación

Edita `pricing/sources.json`: una ficha fija necesita `product_url`; una búsqueda necesita `query` y la tienda necesita `search_url` y `product_path_pattern`. Define `expected_terms`, `expected_pattern`, `unit` y `pack`; no deduzcas cantidades desde el precio. Nuevas cadenas requieren también su entrada y dominios de producto en `dist/data.js`. La instalación y los comandos están en [PRECIOS-AUTOMATICOS.md](PRECIOS-AUTOMATICOS.md).
