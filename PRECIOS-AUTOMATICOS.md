# Precios automáticos · instalación y mantenimiento

El proyecto incluye un actualizador ejecutable y una integración con la calculadora. Consulta un catálogo acotado de productos; **no rastrea todo el supermercado**. Necesita Python 3.11 o superior. Las consultas HTTP usan la biblioteca estándar; el renderizado requiere Playwright y Chromium. GitHub Actions los instala automáticamente.

## Estado de la entrega

La última ejecución disponible de GitHub Actions fue el 22 de septiembre de 2026. El catálogo contempla 23 ingredientes en cinco supermercados. Esto expresa la cobertura configurada, no la cantidad de precios obtenidos: revisa `dist/prices.json` y el enlace `runUrl` de su ejecución para conocer la cobertura real.

Cada ejecución registra qué tiendas entregan datos utilizables y el motivo de los fallos. La calculadora compara las ofertas en la columna Tienda, descarta precios anteriores de la selección automática y usa valores de ejemplo identificados cuando no hay una oferta vigente. Tottus y Unimarc se consultan con Chromium cuando se usa `--browser`. Si sus páginas bloquean el acceso o no exponen una oferta inequívoca, quedan sin confirmar.

## Cómo funciona

1. `pricing/sources.json` identifica la ficha, ingrediente, moneda, formato y palabras esperadas. Se consulta `robots.txt` antes de leer rutas de la tienda.
2. Si `vtex` está activado, prueba la búsqueda pública por URL de producto de la [API Search de VTEX](https://developers.vtex.com/docs/api-reference/search-api). Exige producto, SKU y vendedor inequívocos.
3. En Tottus y Unimarc, `--browser` carga las páginas con Chromium y espera contenido renderizado. En las demás cadenas, si la API no existe, no devuelve datos o su respuesta no es utilizable, descarga la ficha pública y busca un `Product` con `Offer` en JSON-LD. También acepta una `PriceSpecification` simple, microdatos, metadatos de producto y, si los configuras, selectores HTML específicos. La estructura de precio y moneda se basa en [Schema.org Offer](https://schema.org/Offer).
4. Exige nombre/formato esperado, precio positivo y CLP. No elige arbitrariamente el menor precio entre múltiples ofertas ni utiliza `AggregateOffer.lowPrice`. No interpreta promociones por cantidad, tarjetas o membresías como un precio general cuando están identificadas como condicionales.
5. Escribe `dist/prices.json` y `dist/prices-snapshot.js`. Cada archivo se reemplaza de forma atómica. Si una consulta falla, conserva el precio anterior solo si corresponde a la misma configuración, sin cambiar su fecha real.
6. La web usa estos datos al abrirse y revisa su archivo público cada cinco minutos cuando la pestaña está visible y no se está editando un control. «Revisar actualización» consulta ese archivo, no la tienda.

La descarga de precios ocurre fuera del navegador, evitando consultas a las tiendas desde cada visitante. No necesita un servidor web de Python ni un endpoint público que acepte URLs. Las tiendas se consultan en paralelo y las fichas de cada tienda en secuencia, con pausas y límites de lectura. Chromium tiene un presupuesto de 60 páginas o 300 segundos por tienda; al alcanzarlo conserva los precios anteriores.

Una respuesta de autenticación, bloqueo o límite de consultas detiene las consultas al host en esa ejecución. Si una ruta está excluida por robots, no se usa otra ruta como atajo para esa consulta. No se implementan proxies rotatorios, resolución de CAPTCHA ni sesiones privadas. Si eso impide obtener datos, usa una fuente autorizada por la tienda o deja el producto sin confirmar.

## Catálogo inicial

| Ingrediente | Producto de referencia | Formato aplicado al consultar |
| --- | --- | --- |
| `panCompleto` | [Pan Hot Dog Castaño 480 g](https://www.jumbo.cl/pan-hot-dog-castano-480-gr-8-un/p) | 8 unidades |
| `vienesa` | [Salchichas San Jorge 1 kg](https://www.jumbo.cl/salchichas-san-jorge-1-kg-2/p) | 20 unidades |
| `mayo` | [Mayonesa Hellmann's Doypack](https://www.jumbo.cl/mayonesa-hellmanns-2054590/p) | 0,8 kg |
| `arroz` | [Arroz Tucapel Grado 1 Gran Selección](https://www.jumbo.cl/arroz-grado-1-tucapel-gran-seleccion-grano-largo-y-ancho-1-kg/p) | 1 kg |
| `pasta` | [Spaghetti Carozzi N°5](https://www.jumbo.cl/spaghetti-n-5-carozzi-bolsa-400-g-2/p) | 0,4 kg |

Además se buscan dieciocho ingredientes de verduras, carnes, despensa, picoteo y bebidas con formato explícito. `pricing/discover.py` usa hasta tres consultas de respaldo por producto, deduplica enlaces con parámetros de seguimiento y prioriza títulos que declaran el formato. Puede reparar una ficha fija que cambió de URL mediante el buscador público. Descubre hasta ocho candidatos por búsqueda y valida su nombre y formato antes de leer precios. Los ingredientes sin resultado conservan estimaciones identificadas. Mercado Libre no participa en la comparación de supermercados. Los importes corresponden al contexto web público consultado, sin ubicación, sesión ni despacho. La disponibilidad local y el precio final se confirman en la tienda.

## Primera ejecución

Abre una terminal dentro de la carpeta `la-junta`:

```sh
python3 --version
python3 -m pip install -r pricing/requirements.txt
python3 -m playwright install --with-deps chromium
python3 pricing/sync_prices.py --validate-config
python3 pricing/sync_prices.py --browser --ingredient panCompleto
```

En Windows, si tu instalación usa el lanzador de Python, reemplaza `python3` por `py -3`. Revisa el resultado en `dist/prices.json`: `status: "ok"`, `source`, importe, formato y `fetchedAt`. Compara con la ficha pública de ese mismo producto. Una actualización parcial no es una cotización de toda la lista.

Después ejecuta el catálogo completo:

```sh
python3 pricing/sync_prices.py --browser --report-dir artifacts/pricing
```

Para publicar manualmente una actualización, vuelve a subir **ambos** archivos de precios a la misma carpeta pública que `index.html`. Al abrir desde `ABRIR.html`, se utiliza la copia `prices-snapshot.js` incluida; un archivo local no recibe publicaciones posteriores automáticamente.

### Códigos de salida

| Código | Significado |
| --- | --- |
| `0` | Todos los productos solicitados devolvieron precio utilizable |
| `2` | Resultado parcial o sin precios utilizables; los resultados y diagnósticos se guardaron |
| `1` | Error de configuración, escritura o ejecución; revisar el mensaje de terminal |

Un producto agotado se registra como `unavailable`; no cuenta como precio utilizable. El workflow admite código 2 y publica el diagnóstico para que la web muestre el estado real.

## Opción A · hosting con Python y tareas cron

Publica el contenido de `dist` en tu carpeta pública. Conserva `pricing/` fuera de esa carpeta: por ejemplo, `/home/TU_USUARIO/la-junta/pricing`. Asegúrate de que el usuario de cron pueda escribir los archivos de precios y el bloqueo temporal del actualizador.

En el administrador de tareas cron, configura una ejecución cada dos horas. Cambia las rutas de este ejemplo por las reales de tu hosting; verifica también la ubicación de Python:

```cron
23 */2 * * * /usr/bin/python3 /home/TU_USUARIO/la-junta/pricing/sync_prices.py --browser --config /home/TU_USUARIO/la-junta/pricing/sources.json --output /home/TU_USUARIO/public_html/prices.json >> /home/TU_USUARIO/la-junta/precios.log 2>&1
```

Si publicas la calculadora en una subcarpeta, cambia `--output` a esa carpeta. El script escribe `prices-snapshot.js` junto al JSON automáticamente. La zona horaria de cron depende del servidor. Programa también la rotación habitual del log para evitar que crezca indefinidamente.

Instala también las dependencias y Chromium con el mismo usuario que ejecutará cron. Un hosting compartido puede no permitir navegadores; en ese caso usa GitHub Actions o un servidor propio.

## Opción B · GitHub Actions y hosting conectado al repositorio

1. Sube el proyecto completo a tu repositorio, incluida `.github/workflows/update-prices.yml`. Debe estar en la rama predeterminada.
2. Habilita Actions en el repositorio. El workflow solicita permiso de escritura de contenido para guardar los dos archivos de precios. Si una política de organización o de rama lo impide, utiliza un flujo aprobado por tu organización o la opción cron; el workflow no evita esas restricciones.
3. Abre Actions → «Actualizar precios de La Junta» → «Run workflow». Revisa el resultado y las fichas antes de depender de sus importes.
4. Conecta el hosting a esa rama, con `dist` como carpeta de publicación. El script actualiza el repositorio; el hosting debe desplegar esos cambios para que lleguen al sitio.
5. Comprueba que `prices.json` en tu dominio tenga el último intento. Si tu hosting no despliega automáticamente estos commits, configura un build hook y guarda su URL como secreto de Actions llamado `BUILD_HOOK_URL`. El workflow lo invoca después de guardar los cambios. Netlify explica cómo crear esa URL en su [guía de build hooks](https://docs.netlify.com/build/configure-builds/build-hooks/). Mantén esa URL en el secreto, no en el código público.

El horario incluido es `23 */2 * * *`, en UTC. Las ejecuciones programadas requieren que el archivo exista en la rama predeterminada y pueden retrasarse; GitHub también puede desactivar horarios en repositorios públicos inactivos. Revisa periódicamente el estado de Actions, según su [documentación de eventos programados](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

El workflow está subido al repositorio. Instala Chromium y ejecuta una prueba de una ficha sintética con JavaScript antes de consultar tiendas. Además del horario cada dos horas y del botón manual, se ejecuta cuando cambian `pricing/` o el workflow en `main`. Los costos o cuotas de tu proveedor dependen de tu plan.

## Añadir productos o tiendas

Edita `pricing/sources.json`. Usa un identificador de ingrediente existente en `dist/data.js`, una ficha de producto concreta y un formato comprobado. `pack` expresa el contenido total del envase en `kg`, `L` o `un`, nunca el precio por kilogramo ni una cantidad estimada del título. No mezcles peso neto con peso drenado o pulpa comestible sin definir la conversión correspondiente.

`expected_terms` exige que todas las palabras aparezcan en el nombre, ignorando mayúsculas y acentos. `expected_pattern` permite exigir la presentación, por ejemplo `\\b800\\s*g\\b` en JSON para 800 g. Si cambias la configuración, un precio anterior de otra presentación no se reutiliza. Si el nombre público no contiene el formato requerido, revisa la ficha y la configuración; no elimines la validación solo para aceptar cualquier resultado.

Para una tienda nueva, configura nombre, `origin`, `allowed_hosts`, `currency: "CLP"`, `scope`, `products` y `vtex`. Agrega también su identificador, enlace de búsqueda y `productHosts` en `dist/data.js`, para que aparezca en la columna Tienda. No hay selector global de supermercado. `vtex: false` pasa directamente a la ficha; `browser.enabled: true` activa Chromium en esa tienda al ejecutar con `--browser`. Otros proveedores de API requieren un adaptador adicional; no están implementados por defecto.

Cuando VTEX publique varias presentaciones o vendedores, identifica y configura `product_id`, `sku_id` y `seller_id` según la respuesta real. El código interno mostrado en la web no se considera automáticamente un identificador VTEX.

### Extracción mediante selectores

Si el HTML entregado por el servidor contiene el precio pero no JSON-LD ni metadatos, añade `html_selectors` al producto o a su tienda. Este ejemplo describe un HTML hipotético; **no son selectores verificados de Jumbo**:

```json
{
  "html_selectors": {
    "name": "h1",
    "price": "[data-testid=product-price]",
    "currency": "meta[property=product:price:currency]",
    "availability": "#product-availability",
    "price_locale": "es-CL"
  }
}
```

Admite selectores simples: etiqueta, `.clase`, `#id`, `[atributo=valor]` y etiqueta con atributo. El parser de selectores no implementa selectores descendientes ni pseudoclases. Se aplica al HTML entregado por HTTP o renderizado con Chromium. Cada selector debe encontrar **un solo elemento**. `currency` y `availability` son opcionales: sin el primero se usa la moneda configurada; sin el segundo la disponibilidad queda sin confirmar. Elimina los campos que no existan en el HTML real. Para el precio, usa un elemento que contenga exclusivamente el importe del envase; nunca cuotas, precio por kilo o una promoción por tarjeta. Usa `price_locale: "machine"` si el contenido es `1990.00`, o `es-CL` si es `$1.990`.

El sitio puede cambiar el HTML sin aviso. Una extracción que no encuentra un elemento único falla explícitamente y requiere mantenimiento. Para contenido disponible solo tras ejecutar JavaScript, usa `--browser` y activa `browser.enabled` en esa tienda. Esto renderiza la página, pero sigue siendo necesario un precio verificable y acceso permitido por la fuente.

## Snapshots y continuidad

Cada ejecución de Actions guarda un artefacto `precios-<run_id>` durante 30 días. Se descarga desde la página de esa ejecución, en Artifacts. Contiene:

- `prices.json` y `prices-snapshot.js`: todos los resultados de los productos configurados, con fechas y enlace a la ejecución.
- `health.json` y `coverage.md`: cantidades vigentes, anteriores, agotadas y sin precio por tienda.
- Un informe por cadena; para Chromium incluye páginas consultadas, estados HTTP y motivo de detención, sin cookies ni cabeceras.

El historial de commits conserva las versiones publicadas. El snapshot es completo respecto de `sources.json`, no respecto del catálogo entero del supermercado. Las consultas fallidas conservan el último precio válido de la misma configuración. `lastValid` permite mantenerlo incluso después de una respuesta de producto agotado; no renueva `fetchedAt` ni convierte ese precio en vigente.

## Diagnóstico

`attempts` muestra qué fuente se intentó. `checkedAt` es la fecha del último intento; `fetchedAt` es la de obtención del precio. Son distintas cuando una actualización falla.

| Estado o error | Qué revisar |
| --- | --- |
| `pending` | Todavía no se ejecutó el actualizador en tu instalación |
| `stale` | Último intento fallido; el precio y su fecha anterior se conservan |
| `api_no_exact_match` | La API no identificó la ficha exacta; se intenta HTML |
| `no_public_price` | El HTML no publica un precio identificable; revisar datos estructurados o adaptador |
| `product_mismatch` | Cambió el nombre o formato, o la ficha no coincide |
| `ambiguous_sku` / `ambiguous_seller` | Falta seleccionar una presentación o vendedor exacto |
| `robots_denied` / `robots_unavailable` | Ruta excluida o política de rastreo inaccesible |
| `http_401` / `http_403` / `http_429` / `host_blocked` | Acceso requerido o consultas limitadas; la ejecución no insiste |
| `browser_unavailable` | Instalación de Playwright/Chromium fallida |
| `browser_navigation_failed` / `browser_error` | Carga o renderizado fallido; revisar el informe de la tienda |
| `browser_budget_exhausted` | Se alcanzó el presupuesto de páginas o tiempo; revisar cobertura antes de ajustar límites |
| `challenge` | La página exige verificación humana; la ejecución no insiste |
| `network_error` | Conectividad, DNS, TLS o tiempo de espera del servidor |
| Web con datos antiguos | Verificar despliegue, caché y ubicación de ambos archivos |

El precio pasa a «Anterior» en la interfaz al superar `maxAgeHours`, aunque todavía no haya otra ejecución del actualizador. El valor predeterminado es 24 horas. Esto no renueva ni corrige un precio: muestra su antigüedad.

## Pruebas incluidas

```sh
node --test tests/*.test.cjs
node scripts/check.mjs
python3 -m unittest discover -s tests -p 'test_*.py'
python3 pricing/sync_prices.py --validate-config
```

Para ejecutar también la prueba de Chromium tras instalarlo: `RUN_BROWSER_TESTS=1 python3 -m unittest discover -s tests -p 'test_*.py'`. Las pruebas no se conectan a tiendas; la ficha de la prueba de navegador es sintética y se intercepta localmente. Validan la secuencia de fuentes, conservación de fechas, rechazos por producto o moneda incorrectos, bloqueos, extracción estructurada y selectores, además del presupuesto con formatos reales. La comprobación de una tienda en producción es un paso separado de instalación.
