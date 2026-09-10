# Consulta y comparación de supermercados

La columna **Tienda** reúne Jumbo, Santa Isabel, Lider, Tottus y Unimarc por ingrediente. Incluye precio del envase, precio normalizado por kg/L/unidad, ficha y fecha. No hay selector global de tienda.

El presupuesto compara el costo de cubrir la cantidad faltante después de descontar stock. Con redondeo activado compara envases completos; sin él compara cantidades proporcionales. Solo participan precios vigentes; un precio editado manualmente tiene prioridad. Es el menor costo entre los productos consultados, no una garantía de mínimo de todo el catálogo. Las marcas pueden diferir y no se incluye despacho.

## Extracción

- VTEX público cuando está configurado, con fallback a HTML si la API no devuelve información válida.
- En fichas: JSON-LD Product/Offer, metadatos de producto o selectores explícitos.
- En búsquedas: enlaces de producto en HTML, JSON-LD y datos públicos `__NEXT_DATA__`; se inspeccionan hasta tres fichas coincidentes.
- Cada producto debe coincidir con sus términos, formato y moneda CLP. No se toman cuotas, mínimos de AggregateOffer ni ofertas estructuradas con condiciones de membresía.
- Se respetan robots.txt, redirecciones al dominio autorizado, pausas, límites de tamaño y bloqueos. Un 401/403/429 o CAPTCHA detiene las consultas al dominio durante esa ejecución.

No hay navegador automatizado ni inicio de sesión: las tiendas que solo entreguen el precio después de ejecutar JavaScript pueden quedar sin datos. Los errores se publican como errores, sin sustituirlos por precios inventados.

## Operación

El workflow `.github/workflows/update-prices.yml` corre cada seis horas, manualmente y al cambiar `pricing/` o el workflow en `main`. Publica los archivos JSON y JS juntos en un commit. Netlify debe estar vinculado a `main` para desplegar ese commit. El resumen de Actions indica cobertura; una ejecución exitosa puede tener consultas parciales.

`Revisar actualización` en la web descarga el último resultado publicado; no consulta supermercados desde el navegador. `dist/prices.json` incluye `runUrl` para auditar la ejecución.

Para ampliar cobertura, edita `pricing/sources.json`: una ficha fija necesita `product_url`; una búsqueda necesita `query` y la tienda necesita `search_url` y `product_path_pattern`. Siempre define `expected_terms`, `expected_pattern`, `unit` y `pack`. Nunca deduzcas el peso del producto usando su precio.

La primera ejecución real validó cinco productos de Jumbo mediante `html-jsonld`: pan, vienesas, mayonesa, arroz y pasta. La cobertura actual y los errores específicos de las demás tiendas se consultan en el snapshot y el resumen de Actions.

## Cobertura comprobada el 10 de septiembre de 2026

[Ejecución real verificada](https://github.com/leoescobarh/la-junta/actions/runs/34490225233), con consultas iniciadas a las 14:37 UTC:

| Supermercado | Precios obtenidos | Resultado |
| --- | ---: | --- |
| Jumbo | 21 de 23 | Extracción HTML JSON-LD |
| Santa Isabel | 9 de 23 | Extracción HTML JSON-LD; otras fichas inexistentes o sin coincidencia |
| Lider | 5 de 23 | Extracción HTML JSON-LD desde `super.lider.cl` |
| Tottus | 0 de 23 | HTTP 403; no se insistió después del bloqueo |
| Unimarc | 0 de 23 | No se pudo verificar robots.txt; no se extrajeron fichas |

Son 35 precios para ingredientes que pueden repetirse entre tiendas, no 35 productos diferentes. Se comprobaron los productos extraídos, se corrigió una coincidencia de maní con sal y se excluyó el catálogo general de Mundo Lider. No se simulan precios para completar las columnas. La cobertura puede cambiar en ejecuciones posteriores.
