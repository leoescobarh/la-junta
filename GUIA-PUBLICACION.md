# Publicar La Junta

## Hosting con administrador de archivos o SFTP

1. Descomprime `la-junta-proyecto-completo.zip` en tu computador.
2. Abre la carpeta `la-junta/dist`.
3. Sube **todos los archivos y la carpeta `assets`** a la carpeta pública que te indique tu hosting. Suele llamarse `public_html`, `www` o `htdocs`.
4. Abre la dirección de tu dominio.

El `index.html` debe estar directamente dentro de la carpeta que se sirve en esa dirección. Sube todo `dist`: incluye también `pricing.js`, `prices.json` y `prices-snapshot.js`, además del catálogo, cálculo, aplicación, estilos e imágenes.

La web estática no requiere PHP, Node.js, MySQL ni variables de entorno. Puedes publicarla dentro de una subcarpeta gracias a sus enlaces relativos. Para consultar las tiendas automáticamente necesitas ejecutar el script Python en un servidor o en GitHub Actions, siguiendo [PRECIOS-AUTOMATICOS.md](PRECIOS-AUTOMATICOS.md).

## Netlify con carpeta

Accede a [Netlify Drop](https://app.netlify.com/drop) con tu cuenta y arrastra la carpeta **`dist`**, no el ZIP del proyecto completo. Es una web estática ya preparada para publicar. Netlify documenta este flujo de arrastrar una carpeta con archivos HTML en su [guía de despliegues](https://docs.netlify.com/deploy/create-deploys/).

También se incluye `la-junta-netlify-dist.zip`: descomprímelo y arrastra la carpeta resultante a Netlify Drop. En ese paquete `index.html` queda directamente en la raíz y no debes configurar `dist` como carpeta de publicación. Si Netlify conserva un valor anterior de publicación, déjalo vacío o usa la raíz (`.`).

Para actualizar, sube la carpeta `dist` modificada en el apartado de despliegues del mismo proyecto. Si utilizas el ZIP listo para Netlify, vuelve a subir su contenido con `index.html` en la raíz.

Este método manual conserva los precios incluidos en la carpeta subida. Para renovarlos automáticamente, conecta un repositorio y el actualizador, o vuelve a publicar después de ejecutar el script.

## Netlify desde un repositorio

Sube el proyecto a tu repositorio y conéctalo a Netlify. El archivo incluido `netlify.toml` establece `dist` como carpeta de publicación. No necesitas un comando de compilación. Consulta la [configuración por archivo de Netlify](https://docs.netlify.com/build/configure-builds/file-based-configuration/) si deseas adaptar el despliegue.

## Otros alojamientos estáticos

Usa `dist` como directorio público y omite la compilación. El único punto de entrada es `index.html`; no hay rutas internas que requieran una regla de reescritura. Mantén los nombres de archivos y el orden de los scripts.

## Comprobar la publicación

Después de subirla, cambia el número de invitados, selecciona otra comida y revisa que la lista y el total se actualicen. Abre la página desde tu celular y comprueba que los enlaces de compra llevan a una búsqueda útil para tu ubicación.

Después de activar el actualizador, consulta `prices.json` desde tu dominio: debe tener una fecha real de intento en `checkedAt`. Una consulta exitosa añade `fetchedAt` y `status: "ok"` por producto. Pulsa «Revisar actualización» en la lista y comprueba sus etiquetas. Si aparece `error`, revisa el diagnóstico del archivo; no se obtuvo un precio confirmado. Configura la caché del hosting para que `prices.json` y `prices-snapshot.js` se revaliden; Netlify ya tiene estas cabeceras en `netlify.toml` cuando publica desde el repositorio.

Si faltan estilos o imágenes, comprueba que se subió toda la carpeta. Si aparece una versión antigua después de actualizarla, realiza una recarga completa o limpia la caché del hosting.

Usa HTTPS para que la función moderna de copiar esté disponible. Si un navegador bloquea la copia al abrir el archivo directamente, «Descargar» permite guardar la lista de todas formas.

Las guías externas se consultaron el 9 de septiembre de 2026. No se ha publicado el proyecto en ninguna cuenta ni dominio desde esta entrega.
