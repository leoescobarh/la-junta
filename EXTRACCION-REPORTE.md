# Mejoras privadas del extractor

Rama local: `mejoras-extractor`  
Commit de base: `b9313b0`  
Commit de mejoras: `77f0507`  
Fecha de revisión: 22 de septiembre de 2026

## Qué se aplicó

- Hasta tres consultas de respaldo por producto: consulta configurada, consulta sin gramaje y términos esenciales.
- Priorización de enlaces cuyo título declara el gramaje o cantidad esperada.
- Deduplicación de la misma ficha cuando aparece con `from`, `q`, `ft`, `utm_*` u otros parámetros de seguimiento.
- Hasta ocho candidatos por búsqueda, con validación estricta de nombre, marca, formato, moneda y precio antes de aceptar.
- Reparación de fichas fijas que cambiaron de URL usando el buscador público de la tienda.
- Aceptación segura de enlaces relativos en respuestas VTEX.
- Lectura de `PriceSpecification` simple y microdatos de producto, sin tomar `AggregateOffer.lowPrice`, precios unitarios, membresías o promociones condicionadas.
- Detección más clara de páginas que muestran verificación de seguridad para que el informe marque el bloqueo y no lo confunda con “sin producto”.
- Consultas alternativas y términos de descubrimiento configurados para formatos que habían quedado sin resultados (arroz, mayonesa, snacks, bebidas, carnes y otros).

## Comprobaciones ejecutadas

- `python -m unittest discover -s tests`: **37 pruebas correctas**, 1 prueba de Chromium omitida porque requiere el navegador instalado.
- `npm test -- --runInBand`: **33 pruebas correctas**.
- `python -m py_compile pricing/*.py`: correcto.
- `git diff --check`: correcto.
- `pricing/sources.json`: válido; **5 tiendas y 115 productos configurados**.

Las pruebas usan respuestas sintéticas y comprueban fallos que pueden causar precios incorrectos: cambio de URL, formato distinto, enlaces duplicados, respuestas VTEX relativas, ofertas ambiguas, precios condicionales y conservación de la fecha de un precio anterior.

## Cobertura real observada

El snapshot disponible en `dist/prices.json` fue generado el 22-09-2026 a las 17:04 UTC:

| Tienda | Precios vigentes | Agotados | Errores | Configurados |
| --- | ---: | ---: | ---: | ---: |
| Jumbo | 22 | 0 | 1 | 23 |
| Santa Isabel | 7 | 2 | 14 | 23 |
| Lider | 11 | 2 | 10 | 23 |
| Tottus | 0 | 0 | 23 | 23 |
| Unimarc | 14 | 0 | 9 | 23 |
| **Total** | **54** | **4** | **57** | **115** |

Tottus quedó sin precios en esa ejecución porque la página respondió con HTTP 403 y, en la revisión manual del navegador, mostró una verificación de seguridad. El extractor conserva el bloqueo y no intenta saltarlo con proxies, CAPTCHA, cookies personales ni cambios de huella. Para conseguir esos precios de forma estable se necesita un canal autorizado de la tienda, un feed público o ejecutar el navegador desde una infraestructura permitida por ella.

La red local de esta revisión no tiene salida directa a las tiendas, por lo que la cobertura anterior corresponde al último snapshot de Actions y las nuevas técnicas se validaron con pruebas reproducibles. Antes de publicar la rama se debe lanzar una ejecución real y revisar `attempts`, `health.json` y los informes por tienda.

## Cómo probar la rama

```sh
python3 pricing/sync_prices.py --validate-config
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.test.cjs
```

Para una ejecución real con navegador:

```sh
python3 -m pip install -r pricing/requirements.txt
python3 -m playwright install --with-deps chromium
python3 pricing/sync_prices.py --browser --report-dir artifacts/pricing
```

La rama está preparada para subirla a GitHub cuando se apruebe la publicación. Hasta entonces, el proyecto público y el sitio desplegado no se modifican.
