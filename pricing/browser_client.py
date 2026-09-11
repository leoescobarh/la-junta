"""Chromium para páginas públicas que cargan los productos con JavaScript.

Una sesión anónima por tienda y ejecución. Sin extensiones, proxies, sesiones
personales, cambios de huella ni solución de CAPTCHA. Los bloqueos se conservan.
"""
import ipaddress
import json
import re
import time
from urllib.parse import urlsplit, urlunsplit

from price_errors import AccessBlocked, PriceError
from sync_prices import PublicClient, safe_url, MAX_BYTES


def public_resource(url):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
        return False
    host = parsed.hostname.lower()
    if host == 'localhost' or host.endswith(('.localhost', '.local', '.internal')):
        return False
    try:
        return ipaddress.ip_address(host).is_global
    except ValueError:
        return '.' in host


def report_url(url):
    """Los informes no contienen tokens, cookies ni parámetros de sesión."""
    p = urlsplit(url)
    return urlunsplit((p.scheme, p.netloc, p.path, '', ''))


def page_block(status, title, visible_text=''):
    if status in (401, 403, 429):
        return AccessBlocked('http_' + str(status), 'La tienda respondió HTTP ' + str(status) + ' al navegador.')
    if re.search(r'just a moment|access denied|verify you are human|checking your browser|captcha', title, re.I):
        return AccessBlocked('challenge', 'La tienda solicita una verificación al navegador.')
    if re.search(r'verifica que eres humano|verifique que es humano|confirma que no eres un robot|unusual traffic|checking your browser', visible_text, re.I):
        return AccessBlocked('challenge', 'La tienda solicita una verificación al navegador.')
    return None


READY = r'''pattern => {
  const path = new RegExp(pattern);
  if ([...document.querySelectorAll('a[href]')].some(a => path.test(new URL(a.href, location.href).pathname))) return true;
  if ([...document.querySelectorAll('script[type="application/ld+json"]')].some(s => /"offers"\s*:/.test(s.textContent))) return true;
  return !!document.querySelector('meta[property="product:price:amount"], [itemprop="price"]');
}'''


class BrowserClient(PublicClient):
    rendered = True

    def __init__(self, stores, timeout=20, delay=2):
        super().__init__(stores, timeout, delay)
        self.store = next(iter(stores.values()))
        self.options = self.store.get('browser', {})
        self.driver = self.browser = self.context = self.page = None
        self.failure = None
        self.started = time.monotonic()
        self.pages = 0
        self.navigation_error = None
        self.records = []
        self.network_records = []
        self.payloads = []

    def _ensure_browser(self):
        if self.failure:
            raise self.failure
        if self.page:
            return
        try:
            from playwright.sync_api import sync_playwright
            self.driver = sync_playwright().start()
            self.browser = self.driver.chromium.launch(headless=True)
            self.context = self.browser.new_context(locale='es-CL', service_workers='block')
            self.page = self.context.new_page()
            self.context.route('**/*', self._route)
            self.page.on('response', self._response)
        except Exception as error:
            self.failure = PriceError('browser_unavailable', 'No se pudo iniciar Chromium; revisa la instalación del servicio.')
            self.close()
            raise self.failure from error

    def _route(self, route):
        request = route.request
        if not public_resource(request.url):
            if request.is_navigation_request() and request.frame == self.page.main_frame:
                self.navigation_error = PriceError('invalid_url', 'La navegación salió de los dominios configurados.')
            route.abort()
            return
        if request.is_navigation_request() and request.frame == self.page.main_frame:
            try:
                safe_url(request.url, self.hosts)
                self._policy(request.url)
            except PriceError as error:
                self.navigation_error = error
                route.abort()
                return
        if request.resource_type in ('image', 'media', 'font'):
            route.abort()
        else:
            route.continue_()

    def _response(self, response):
        # Solo respuestas del catálogo en los dominios de esa tienda. No se
        # reproducen llamadas internas ni se guardan cabeceras/autenticación.
        try:
            if response.request.resource_type not in ('xhr', 'fetch'):
                return
            if urlsplit(response.url).hostname not in self.hosts:
                return
            if len(self.network_records) < 30:
                self.network_records.append({'url': report_url(response.url), 'status': response.status})
            if response.status != 200 or len(self.payloads) >= 10:
                return
            if 'json' not in response.headers.get('content-type', ''):
                return
            if int(response.headers.get('content-length', '0') or 0) > MAX_BYTES:
                return
            body = response.body()
            if len(body) <= MAX_BYTES:
                self.payloads.append(json.loads(body))
        except Exception:
            # Una respuesta ajena al producto no impide leer el DOM.
            return

    def get(self, url):
        safe_url(url, self.hosts)
        if self.failure:
            raise self.failure
        if self.pages >= self.options.get('maxPages', 60) or time.monotonic() - self.started > self.options.get('budgetSeconds', 300):
            self.failure = PriceError('browser_budget_exhausted', 'Se alcanzó el límite de esta consulta; se mantiene el último precio válido.')
            raise self.failure
        record = {'url': report_url(url), 'engine': 'chromium'}
        self.records.append(record)
        try:
            self._policy(url)
            self._ensure_browser()
            remaining = self.last_request.get(urlsplit(url).hostname, 0) + self.delay - time.monotonic()
            if remaining > 0:
                time.sleep(remaining)
            self.last_request[urlsplit(url).hostname] = time.monotonic()
            self.pages += 1
            self.payloads = []
            self.navigation_error = None
            try:
                response = self.page.goto(url, wait_until='domcontentloaded', timeout=self.timeout * 1000)
            except Exception as error:
                if self.navigation_error:
                    raise self.navigation_error from error
                block = page_block(None, self.page.title())
                if block:
                    raise block from error
                raise PriceError('browser_navigation_failed', 'La página no terminó de cargar dentro del plazo.') from error
            if self.navigation_error:
                raise self.navigation_error
            safe_url(self.page.url, self.hosts)
            status = response.status if response else None
            record['httpStatus'] = status
            record['title'] = self.page.title()[:150]
            block = page_block(status, record['title'], self.page.locator('body').inner_text(timeout=2000)[:4000])
            if block:
                raise block
            if status and status >= 400:
                raise PriceError('http_' + str(status), 'La tienda devolvió un error al cargar la página.')
            try:
                self.page.wait_for_function(READY, arg=self.store['product_path_pattern'], timeout=self.options.get('waitMilliseconds', 12000))
            except Exception:
                # Se inspecciona lo que sí cargó; un timeout no inventa datos.
                pass
            block = page_block(status, self.page.title(), self.page.locator('body').inner_text(timeout=2000)[:4000])
            if block:
                raise block
            html = self.page.content()
            if len(html.encode('utf-8')) > MAX_BYTES:
                raise PriceError('response_too_large', 'El documento renderizado supera el límite de lectura.')
            # Las respuestas JSON públicas sirven para descubrir enlaces. Para
            # cotizar se verifica después la ficha concreta con Product/Offer.
            for payload in self.payloads:
                encoded = json.dumps(payload, ensure_ascii=False).replace('<', '\\u003c')
                if len(html) + len(encoded) <= MAX_BYTES:
                    html += '<script type="application/json" data-junta-catalog="true">' + encoded + '</script>'
            record['status'] = 'loaded'
            return html
        except AccessBlocked as error:
            self.failure = error
            record['status'] = error.code
            raise
        except PriceError as error:
            record['status'] = error.code
            raise
        except Exception as error:
            record['status'] = 'browser_error'
            raise PriceError('browser_error', 'Falló la lectura de la página renderizada.') from error

    def report(self):
        return {'engine': 'chromium', 'pagesRead': self.pages, 'navigations': self.records,
                'network': self.network_records, 'stopReason': self.failure.code if self.failure else None}

    def close(self):
        for handle in (self.context, self.browser, self.driver):
            if handle:
                try:
                    handle.stop() if handle == self.driver else handle.close()
                except Exception:
                    pass
        self.page = self.context = self.browser = self.driver = None
