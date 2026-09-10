#!/usr/bin/env python3
"""VTEX público → HTML público (JSON-LD/metadatos/selectores).

Python 3.11+, solo biblioteca estándar. No ejecuta JavaScript remoto,
no usa sesiones privadas y no sortea bloqueos ni CAPTCHA.
"""
from __future__ import annotations

import argparse
import contextlib
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import time
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urljoin, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from price_errors import PriceError, AccessBlocked

ROOT = Path(__file__).resolve().parents[1]
BOT = 'LaJuntaPriceBot'
MAX_BYTES = 6 * 1024 * 1024


def timestamp():
    return datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def normalized(value):
    return ''.join(c for c in unicodedata.normalize('NFD', str(value)).lower()
                   if unicodedata.category(c) != 'Mn')


def parse_price(value, locale='machine'):
    if isinstance(value, bool) or value is None:
        raise PriceError('invalid_price', 'El precio no es numérico.')
    text = str(value).strip()
    if locale == 'es-CL':
        text = re.sub(r'CLP|\$|\s', '', text, flags=re.I)
        if not re.fullmatch(r'\d+(?:\.\d{3})*(?:,\d{1,2})?', text):
            raise PriceError('invalid_price', 'Formato de precio chileno ambiguo.')
        text = text.replace('.', '').replace(',', '.')
    try:
        price = Decimal(text)
    except InvalidOperation as exc:
        raise PriceError('invalid_price', 'El precio no es numérico.') from exc
    if not price.is_finite() or price <= 0 or price > 10_000_000:
        raise PriceError('invalid_price', 'El precio está fuera del rango permitido.')
    return int(price.quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def canonical(url):
    parsed = urlsplit(str(url))
    return (parsed.hostname or '').lower(), unquote(parsed.path).rstrip('/')


def safe_url(url, allowed_hosts):
    parsed = urlsplit(url)
    if (parsed.scheme != 'https' or parsed.hostname not in allowed_hosts
            or parsed.username or parsed.password or parsed.port not in (None, 443)):
        raise PriceError('invalid_url', 'URL fuera de los dominios HTTPS configurados.')
    return url


def verify_name(name, target):
    text = normalized(name)
    if not name or not all(normalized(term) in text for term in target['expected_terms']):
        raise PriceError('product_mismatch', 'El producto o su formato no coincide con la ficha configurada.')
    pattern = target.get('expected_pattern')
    if pattern and not re.search(pattern, text, re.I):
        raise PriceError('product_mismatch', 'Cambió el formato del producto; requiere revisión.')
    if target.get('name_pattern') and not re.search(target['name_pattern'], text, re.I):
        raise PriceError('product_mismatch', 'La categoría del producto no coincide con el ingrediente.')
    if any(normalized(term) in text for term in target.get('excluded_terms', [])):
        raise PriceError('product_mismatch', 'La ficha corresponde a otra preparación o presentación.')
    if not target.get('allow_multipack') and re.search(r'\b(?:pack\s+(?:de\s+)?[2-9]\d*|[2-9]\d*\s*[x×]\s*\d)', text):
        raise PriceError('product_mismatch', 'Multipack sin equivalencia de formato configurada.')


def product_identity(product):
    """La marca puede venir separada del nombre, como en las fichas de Lider."""
    name = str(product.get('name') or product.get('productName') or product.get('displayName') or '')
    brand = product.get('brand') or ''
    if isinstance(brand, dict):
        brand = brand.get('name') or ''
    if isinstance(brand, str) and brand and normalized(brand) not in normalized(name):
        name += ' · ' + brand
    return name


def measured_pack(name, target):
    """Convierte únicamente cantidades explícitas. Nunca infiere gramos por unidad."""
    if not target.get('measure_from_name'):
        return target['pack']
    text = normalized(name)
    # Dos medidas de la misma dimensión distintas son ambiguas (neto/drenado,
    # regalos, tamaños de variantes). No se escoge la que abarata el producto.
    expressions = {
        'kg': r'(?<![\d.,])(\d+(?:[.,]\d+)?)\s*(kilogramos?|kilos?|kg|gramos?|grs?|g)\b',
        'L': r'(?<![\d.,])(\d+(?:[.,]\d+)?)\s*(mililitros?|ml|cc|litros?|lts?|l)\b',
        'un': r'(?<![\d.,])(\d+)\s*(unidades|unidad|unids?|uds?|un|piezas)\b',
    }
    values = set()
    for match in re.finditer(expressions[target['unit']], text):
        amount = Decimal(match[1].replace(',', '.'))
        suffix = match[2]
        if target['unit'] == 'kg' and suffix.startswith('g') or target['unit'] == 'L' and suffix in ('ml', 'cc', 'mililitro', 'mililitros'):
            amount /= 1000
        values.add(amount)
    if len(values) != 1:
        raise PriceError('ambiguous_pack' if values else 'missing_pack', 'La ficha no declara un formato de venta único compatible con el ingrediente.')
    pack = float(values.pop())
    limits = target.get('pack_range', [0.005, 25])
    if not limits[0] <= pack <= limits[1]:
        raise PriceError('invalid_pack', 'El formato está fuera del rango configurado para el ingrediente.')
    return int(pack) if target['unit'] == 'un' else pack


def availability(value):
    if isinstance(value, bool):
        return value
    text = str(value or '').lower().replace('_', '').replace('-', '')
    if any(s in text for s in ('outofstock', 'soldout', 'discontinued', 'agotado', 'sin stock')):
        return False
    if any(s in text for s in ('instock', 'limitedavailability', 'disponible')):
        return True
    return None


def offer_value(price, currency, name, stock, source, target, valid_until=None):
    verify_name(name, target)
    if str(currency).upper() != 'CLP':
        raise PriceError('currency_mismatch', 'La moneda publicada no es CLP.')
    if valid_until:
        try:
            # Una fecha sin hora vence al finalizar ese día UTC.
            end = str(valid_until)
            if re.fullmatch(r'\d{4}-\d{2}-\d{2}', end):
                end += 'T23:59:59+00:00'
            expiry = datetime.fromisoformat(end.replace('Z', '+00:00'))
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
            if expiry < datetime.now(timezone.utc):
                raise PriceError('expired_offer', 'La oferta publicada ya venció.')
        except ValueError as exc:
            raise PriceError('invalid_expiry', 'Fecha de vigencia no reconocida.') from exc
    return {
        'price': None if stock is False else parse_price(price),
        'currency': 'CLP', 'productName': str(name), 'available': stock,
        'pack': measured_pack(name, target), 'unit': target['unit'], 'source': source,
        'productUrl': target['product_url']
    }


def parse_vtex(payload, target, store):
    if not isinstance(payload, list):
        raise PriceError('invalid_api_data', 'VTEX no devolvió una lista de productos.')
    matches = []
    for product in payload:
        if not isinstance(product, dict):
            continue
        if target.get('product_id'):
            exact = str(product.get('productId')) == str(target['product_id'])
        else:
            link = product.get('link') or product.get('linkText', '')
            if not str(link).startswith('https://'):
                link = store['origin'] + '/' + str(link).strip('/')
                if not link.endswith('/p'):
                    link += '/p'
            exact = canonical(link) == canonical(target['product_url'])
        if exact:
            matches.append(product)
    if len(matches) != 1:
        raise PriceError('api_no_exact_match', 'No hay una coincidencia exacta en VTEX.')
    product = matches[0]
    skus = product.get('items') or []
    if not isinstance(skus, list) or any(not isinstance(sku, dict) for sku in skus):
        raise PriceError('invalid_api_data', 'VTEX devolvió presentaciones incompletas.')
    if target.get('sku_id'):
        skus = [s for s in skus if str(s.get('itemId')) == str(target['sku_id'])]
    if len(skus) != 1:
        raise PriceError('ambiguous_sku', 'Configura el SKU exacto; hay varias presentaciones.')
    sku = skus[0]
    name = product_identity({**product, 'name': sku.get('nameComplete') or product.get('productName') or sku.get('name')})
    verify_name(name, target)
    sellers = sku.get('sellers') or []
    if not isinstance(sellers, list) or any(not isinstance(seller, dict) for seller in sellers):
        raise PriceError('invalid_api_data', 'VTEX devolvió vendedores incompletos.')
    if store.get('seller_id') is not None:
        sellers = [s for s in sellers if str(s.get('sellerId')) == str(store['seller_id'])]
    if len(sellers) != 1:
        raise PriceError('ambiguous_seller', 'No se encontró un vendedor único.')
    offer = sellers[0].get('commertialOffer') or {}
    if not isinstance(offer, dict):
        raise PriceError('invalid_api_data', 'VTEX devolvió una oferta incompleta.')
    stock = offer.get('AvailableQuantity')
    stock = stock > 0 if isinstance(stock, (float, int)) and not isinstance(stock, bool) else None
    return offer_value(offer.get('Price'), offer.get('CurrencyCode', store['currency']),
                       name, stock, 'vtex', target, offer.get('PriceValidUntil'))


class Document(HTMLParser):
    """Árbol pequeño para JSON-LD y selectores simples; nunca evalúa scripts."""
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}

    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.nodes = []
        self.stack = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        node = {'tag': tag.lower(), 'attrs': dict(attrs), 'text': '', 'parent': self.stack[-1] if self.stack else None}
        self.nodes.append(node)
        if tag not in self.VOID:
            self.stack.append(len(self.nodes) - 1)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.nodes[self.stack[i]]['tag'] == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        # Solo texto directo: evita duplicar textos de scripts en sus ancestros.
        if self.stack:
            self.nodes[self.stack[-1]]['text'] += data

    def text(self, index):
        node = self.nodes[index]
        return node['text'] + ''.join(self.text(i) for i, n in enumerate(self.nodes) if n['parent'] == index)

    def select(self, selector):
        # tag, .clase, #id, [atributo="valor"] o tag[atributo="valor"].
        pattern = r'(?P<tag>[\w-]+)?(?:(?P<kind>[.#])(?P<token>[\w-]+)|\[(?P<attr>[\w:-]+)(?:=[\"\x27]?(?P<value>[^\"\x27\]]+)[\"\x27]?)?\])?'
        match = re.fullmatch(pattern, selector.strip())
        if not match or not selector:
            raise PriceError('invalid_selector', 'Usa un selector simple: tag, .clase, #id o [atributo="valor"].')
        parts = match.groupdict()
        result = []
        for index, node in enumerate(self.nodes):
            attrs = node['attrs']
            if parts['tag'] and parts['tag'].lower() != node['tag']:
                continue
            if parts['kind'] == '#' and attrs.get('id') != parts['token']:
                continue
            if parts['kind'] == '.' and parts['token'] not in str(attrs.get('class', '')).split():
                continue
            if parts['attr'] and (parts['attr'] not in attrs or parts['value'] is not None and attrs[parts['attr']] != parts['value']):
                continue
            result.append((index, node))
        return result

    def one(self, selector):
        values = self.select(selector)
        if len(values) != 1:
            raise PriceError('ambiguous_html', 'El selector debe encontrar exactamente un elemento.')
        index, node = values[0]
        return str(node['attrs'].get('content') or node['attrs'].get('value') or self.text(index)).strip()


def products_in_json(value):
    if isinstance(value, list):
        for entry in value:
            yield from products_in_json(entry)
    elif isinstance(value, dict):
        kinds = value.get('@type', [])
        if isinstance(kinds, str):
            kinds = [kinds]
        if any(str(kind).rsplit('/', 1)[-1] == 'Product' for kind in kinds):
            yield value
        for key in ('@graph', 'mainEntity'):
            if key in value:
                yield from products_in_json(value[key])


def parse_html(html, target, store):
    doc = Document(html)
    candidates = []
    for index, node in enumerate(doc.nodes):
        if node['tag'] != 'script' or str(node['attrs'].get('type', '')).lower() != 'application/ld+json':
            continue
        try:
            parsed = json.loads(node['text'].strip().removeprefix('<!--').removesuffix('-->'))
        except (ValueError, TypeError):
            continue
        for product in products_in_json(parsed):
            if product.get('url') and canonical(urljoin(target['product_url'], product['url'])) != canonical(target['product_url']):
                continue
            try:
                verify_name(product_identity(product), target)
            except PriceError:
                continue
            candidates.append(product)
    if len(candidates) > 1:
        raise PriceError('ambiguous_product', 'La página contiene varias fichas coincidentes.')
    if candidates:
        product = candidates[0]
        offers = product.get('offers')
        if isinstance(offers, list):
            if len(offers) != 1:
                raise PriceError('ambiguous_offer', 'Hay varias ofertas; no se elige la más baja automáticamente.')
            offers = offers[0]
        if isinstance(offers, dict):
            if any(offers.get(key) for key in ('eligibleCustomerType', 'eligibleMembershipTier', 'eligibleQuantity')):
                raise PriceError('conditional_price', 'La oferta tiene condiciones que requieren revisión.')
            # No se usa lowPrice de AggregateOffer ni cuotas o precios por tarjeta.
            if 'price' in offers or availability(offers.get('availability')) is False:
                return offer_value(offers.get('price'), offers.get('priceCurrency'), product_identity(product),
                                   availability(offers.get('availability')), 'html-jsonld', target,
                                   offers.get('priceValidUntil'))
    # Open Graph de producto: se exige nombre y precio únicos en la página.
    try:
        price = doc.one('meta[property="product:price:amount"]')
        currency = doc.one('meta[property="product:price:currency"]')
        name = doc.one('meta[property="og:title"]')
        return offer_value(price, currency, name, None, 'html-meta', target)
    except PriceError as error:
        if error.code in ('product_mismatch', 'currency_mismatch', 'invalid_price'):
            raise
    selectors = target.get('html_selectors') or store.get('html_selectors')
    if selectors:
        name = doc.one(selectors['name'])
        price = parse_price(doc.one(selectors['price']), selectors.get('price_locale', 'es-CL'))
        currency = doc.one(selectors['currency']) if selectors.get('currency') else store['currency']
        stock = availability(doc.one(selectors['availability'])) if selectors.get('availability') else None
        return offer_value(price, currency, name, stock, 'html-selector', target)
    raise PriceError('no_public_price', 'No hay un precio público identificable en el HTML; puede requerir JavaScript o un adaptador específico.')


def parse_robots(text, agent=BOT):
    groups, agents, rules, delay = [], [], [], 0.0
    has_rules = False
    for original in text.splitlines() + ['User-agent: __end__']:
        line = original.split('#', 1)[0].strip()
        if ':' not in line:
            continue
        key, value = (p.strip() for p in line.split(':', 1))
        key = key.lower()
        if key == 'user-agent':
            if has_rules:
                groups.append((agents, rules, delay))
                agents, rules, delay, has_rules = [], [], 0.0, False
            agents.append(value.lower())
        elif key in ('allow', 'disallow') and agents:
            has_rules = True
            if value:
                rules.append((key == 'allow', value))
        elif key == 'crawl-delay' and agents:
            has_rules = True
            try:
                delay = max(0.0, float(value))
            except ValueError:
                pass
    specific = [g for g in groups if any(a != '*' and a in agent.lower() for a in g[0])]
    applicable = specific or [g for g in groups if '*' in g[0]]
    return [r for g in applicable for r in g[1]], max([g[2] for g in applicable] or [0.0])


def robots_allows(rules, url):
    path = urlsplit(url).path or '/'
    if urlsplit(url).query:
        path += '?' + urlsplit(url).query
    matches = []
    for allowed, pattern in rules:
        anchored = pattern.endswith('$')
        raw = pattern[:-1] if anchored else pattern
        expression = '^' + re.escape(raw).replace(r'\*', '.*') + ('$' if anchored else '')
        if re.search(expression, path):
            matches.append((len(raw.replace('*', '')), allowed))
    return max(matches)[1] if matches else True


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        return None


class PublicClient:
    def __init__(self, stores, timeout=15, delay=2):
        self.hosts = {host for store in stores.values() for host in store['allowed_hosts']}
        self.timeout = timeout
        self.delay = max(1.0, float(delay))
        self.robots = {}
        self.blocked = set()
        self.block_reasons = {}
        self.last_request = {}
        self.opener = build_opener(NoRedirect())

    def _raw(self, url):
        safe_url(url, self.hosts)
        host = urlsplit(url).hostname
        if host in self.blocked:
            code, message = self.block_reasons.get(host, ('host_blocked', 'La tienda rechazó la consulta; no se insiste durante esta ejecución.'))
            raise AccessBlocked(code, message)
        spacing = max(self.delay, self.robots.get(host, ([], 0))[1])
        remaining = self.last_request.get(host, 0) + spacing - time.monotonic()
        if remaining > 0:
            time.sleep(remaining)
        self.last_request[host] = time.monotonic()
        request = Request(url, headers={'User-Agent': BOT + '/2.0 (+public price comparison)', 'Accept': 'application/json,text/html,text/plain;q=0.9', 'Accept-Encoding': 'identity'})
        try:
            with self.opener.open(request, timeout=self.timeout) as response:
                body = response.read(MAX_BYTES + 1)
                if len(body) > MAX_BYTES:
                    raise PriceError('response_too_large', 'La respuesta supera el tamaño permitido.')
                charset = response.headers.get_content_charset() or 'utf-8'
                return body.decode(charset, errors='replace'), response.headers.get_content_type()
        except HTTPError as error:
            if error.code in (301, 302, 303, 307, 308):
                return {'redirect': urljoin(url, error.headers.get('Location', ''))}, ''
            if error.code in (401, 403, 429):
                self.blocked.add(host)
                self.block_reasons[host] = ('http_' + str(error.code), 'La tienda respondió HTTP ' + str(error.code) + ' en ' + urlsplit(url).path + '.')
                raise AccessBlocked('http_' + str(error.code), 'La tienda requiere acceso o ha limitado las consultas.') from error
            raise PriceError('http_' + str(error.code), 'La tienda respondió HTTP ' + str(error.code) + '.') from error
        except (URLError, TimeoutError, OSError) as error:
            self.blocked.add(host)
            raise PriceError('network_error', 'No se pudo conectar con la tienda.') from error

    def _policy(self, url):
        host = urlsplit(url).hostname
        if host not in self.robots:
            try:
                robots_url = 'https://' + host + '/robots.txt'
                for _ in range(5):
                    body, _ = self._raw(robots_url)
                    if not isinstance(body, dict):
                        break
                    robots_url = safe_url(body['redirect'], self.hosts)
                else:
                    raise PriceError('robots_redirect_loop', 'Demasiadas redirecciones de robots.txt.')
                if not isinstance(body, str) or '<html' in body.lower() or '<!doctype' in body.lower():
                    raise PriceError('robots_unavailable', 'No se pudo interpretar robots.txt.')
                self.robots[host] = parse_robots(body)
            except PriceError as error:
                if error.code == 'http_404':
                    self.robots[host] = ([], 0)
                else:
                    self.blocked.add(host)
                    code = error.code if isinstance(error, AccessBlocked) else 'robots_' + error.code
                    message = 'No se pudo verificar robots.txt: ' + str(error)
                    self.block_reasons[host] = (code, message)
                    raise AccessBlocked(code, message) from error
        if not robots_allows(self.robots[host][0], url):
            raise AccessBlocked('robots_denied', 'La ruta está excluida por robots.txt.')

    def get(self, url):
        for _ in range(4):
            safe_url(url, self.hosts)
            self._policy(url)
            body, content_type = self._raw(url)
            if isinstance(body, dict):
                url = body['redirect']
                continue
            if content_type == 'text/html' and re.search(r'<title[^>]*>[^<]*(?:just a moment|access denied|captcha|verify you are human)', body, re.I):
                self.blocked.add(urlsplit(url).hostname)
                raise AccessBlocked('challenge', 'La tienda solicita una verificación; no se intenta sortearla.')
            return body
        raise PriceError('too_many_redirects', 'Demasiadas redirecciones.')


def fingerprint(target):
    return hashlib.sha256(json.dumps(target, sort_keys=True, ensure_ascii=True).encode()).hexdigest()[:24]


def refresh_product(client, target, store, previous=None, checked_at=None):
    checked_at = checked_at or timestamp()
    base = {'ingredientId': target['ingredient'], 'productUrl': target.get('product_url'),
            'pack': target['pack'], 'unit': target['unit'], 'fingerprint': fingerprint(target),
            'checkedAt': checked_at, 'attempts': []}
    try:
        if not target.get('product_url'):
            from discover import discover_product
            if isinstance(previous, dict) and previous.get('productUrl'):
                try:
                    verify_name(previous.get('productName'), target)
                    safe_url(previous['productUrl'], store['allowed_hosts'])
                    found = parse_html(client.get(previous['productUrl']), {**target, 'product_url': previous['productUrl']}, store)
                    base['attempts'].append({'source': 'known-product', 'status': 'ok', 'url': previous['productUrl']})
                    return {**base, **found, 'status': 'unavailable' if found['available'] is False else 'ok', 'fetchedAt': checked_at}
                except AccessBlocked:
                    raise
                except PriceError as error:
                    base['attempts'].append({'source': 'known-product', 'status': error.code})
            found, attempts = discover_product(client, target, store)
            base['attempts'].extend(attempts)
            return {**base, **found, 'status': 'ok', 'fetchedAt': checked_at}
        if store.get('vtex', True):
            slug = urlsplit(target['product_url']).path.strip('/').removesuffix('/p')
            api_url = store['origin'].rstrip('/') + '/api/catalog_system/pub/products/search/' + quote(unquote(slug), safe='-') + '/p'
            try:
                raw = client.get(api_url)
                try:
                    payload = json.loads(raw)
                except ValueError as error:
                    raise PriceError('invalid_api_data', 'La API no devolvió JSON válido.') from error
                found = parse_vtex(payload, target, store)
                base['attempts'].append({'source': 'vtex', 'status': 'ok'})
                return {**base, **found, 'status': 'unavailable' if found['available'] is False else 'ok', 'fetchedAt': checked_at}
            except AccessBlocked:
                raise
            except (PriceError, ValueError, KeyError, TypeError) as error:
                base['attempts'].append({'source': 'vtex', 'status': error.code if isinstance(error, PriceError) else 'invalid_api_data'})
        try:
            found = parse_html(client.get(target['product_url']), target, store)
        except AccessBlocked:
            raise
        except PriceError as error:
            if not target.get('fallback'):
                raise
            from discover import discover_product
            base['attempts'].append({'source': 'fixed-product', 'status': error.code, 'url': target['product_url']})
            found, attempts = discover_product(client, target['fallback'], store)
            base['attempts'].extend(attempts)
        base['attempts'].append({'source': 'html', 'status': 'ok'})
        return {**base, **found, 'status': 'unavailable' if found['available'] is False else 'ok', 'fetchedAt': checked_at}
    except (PriceError, ValueError, KeyError, TypeError) as error:
        code = error.code if isinstance(error, PriceError) else 'invalid_source_data'
        base['attempts'].extend(getattr(error, 'attempts', []))
        base['attempts'].append({'source': 'sync', 'status': code})
        message = str(error) if isinstance(error, PriceError) else 'La tienda devolvió datos incompletos.'
        old = previous if isinstance(previous, dict) and previous.get('fingerprint') == base['fingerprint'] else {}
        # Conserva la fecha REAL del precio anterior, nunca la renueva ante un error.
        keep = {key: old[key] for key in ('price', 'currency', 'productName', 'productUrl', 'pack', 'unit', 'available', 'source', 'fetchedAt') if key in old}
        return {**base, **keep, 'status': 'stale' if old.get('price') else 'error', 'error': code, 'message': message}


def read_config(path):
    config = json.loads(Path(path).read_text(encoding='utf-8'))
    if config.get('schemaVersion') != 1 or not isinstance(config.get('stores'), dict):
        raise ValueError('Configuración de precios inválida.')
    for store_id, store in config['stores'].items():
        if config.get('ingredients'):
            overrides = {p['ingredient']: p for p in store.get('products', [])}
            store['products'] = [{**common, **overrides.get(common['ingredient'], {}), **({'fallback': common} if overrides.get(common['ingredient'], {}).get('product_url') else {})} for common in config['ingredients']]
        safe_url(store['origin'], store['allowed_hosts'])
        if store['currency'] != 'CLP':
            raise ValueError('Esta versión calcula únicamente en CLP.')
        seen = set()
        for target in store['products']:
            if target.get('product_url'):
                safe_url(target['product_url'], store['allowed_hosts'])
            elif target.get('query') and store.get('search_url') and store.get('product_path_pattern'):
                safe_url(store['search_url'], store['allowed_hosts'])
            else:
                raise ValueError('Falta ficha o configuración de búsqueda.')
            if target['ingredient'] in seen:
                raise ValueError('Hay dos productos para el mismo ingrediente en ' + store_id)
            seen.add(target['ingredient'])
            if not target['expected_terms'] or target['unit'] not in ('un', 'kg', 'L') or not 0 < target['pack'] <= 1000:
                raise ValueError('Revisa nombre, unidad y formato de ' + target['ingredient'])
            if target['unit'] == 'un' and int(target['pack']) != target['pack']:
                raise ValueError('Los paquetes por unidad deben ser enteros.')
    return config


def sync(config, previous, client=None, only_ingredient=None, only_store=None):
    checked_at = timestamp()
    result = {'schemaVersion': 1, 'generatedAt': checked_at, 'maxAgeHours': config.get('maxAgeHours', 24), 'stores': {}}
    def update_store(entry):
        store_id, store = entry
        old_store = previous.get('stores', {}).get(store_id, {})
        if only_store and store_id != only_store:
            return store_id, old_store
        store_client = client or PublicClient({store_id: store}, config.get('timeoutSeconds', 15), config.get('requestDelaySeconds', 2))
        products = {}
        for target in store['products']:
            old = old_store.get('products', {}).get(target['ingredient'])
            if only_ingredient and target['ingredient'] != only_ingredient:
                if old:
                    products[target['ingredient']] = old
                continue
            products[target['ingredient']] = refresh_product(store_client, target, store, old, checked_at)
        fresh = sum(p.get('status') == 'ok' for p in products.values())
        return store_id, {'name': store['name'], 'currency': store['currency'], 'scope': store['scope'],
                                    'checkedAt': checked_at, 'configured': len(store['products']),
                                    'status': 'ok' if products and fresh == len(products) else 'partial' if fresh else 'error', 'products': products}
    # Paralelismo entre tiendas; cada dominio mantiene sus pausas y sus bloqueos.
    if client is not None:
        result['stores'] = dict(map(update_store, config['stores'].items()))
    else:
        with ThreadPoolExecutor(max_workers=5) as pool:
            result['stores'] = dict(pool.map(update_store, config['stores'].items()))
    return result


def atomic_write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(content, encoding='utf-8')
    os.replace(temporary, path)


def save_snapshot(snapshot, output):
    payload = json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n'
    atomic_write(output, payload)
    # El JS permite abrir ABRIR.html sin un servidor HTTP.
    atomic_write(output.with_name('prices-snapshot.js'), 'globalThis.JuntaPriceSnapshot = ' + payload.replace('<', '\\u003c') + ';\n')


@contextlib.contextmanager
def run_lock(path):
    if path.exists() and time.time() - path.stat().st_mtime > 7200:
        path.unlink()
    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as exc:
        raise RuntimeError('Ya hay una actualización en ejecución.') from exc
    try:
        with os.fdopen(fd, 'w') as file:
            file.write(str(os.getpid()))
        yield
    finally:
        path.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=ROOT / 'pricing/sources.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'dist/prices.json')
    parser.add_argument('--ingredient', help='Comprueba solo un ingrediente, por ejemplo panCompleto.')
    parser.add_argument('--store', help='Comprueba solo una tienda, por ejemplo unimarc.')
    parser.add_argument('--validate-config', action='store_true', help='Comprueba la configuración sin consultar tiendas.')
    args = parser.parse_args()
    config = read_config(args.config)
    if args.store and args.store not in config['stores']:
        parser.error('La tienda no está configurada.')
    if args.ingredient and not any(t['ingredient'] == args.ingredient for s in config['stores'].values() for t in s['products']):
        parser.error('El ingrediente no está configurado.')
    if args.validate_config:
        print('Configuración válida:', sum(len(s['products']) for s in config['stores'].values()), 'productos.')
        return 0
    previous = json.loads(args.output.read_text(encoding='utf-8')) if args.output.exists() else {}
    with run_lock(args.config.parent / '.sync.lock'):
        snapshot = sync(config, previous, only_ingredient=args.ingredient, only_store=args.store)
        save_snapshot(snapshot, args.output)
    total = fresh = 0
    for store_id, store in snapshot['stores'].items():
        if args.store and store_id != args.store:
            continue
        for ingredient, product in store['products'].items():
            if args.ingredient and ingredient != args.ingredient:
                continue
            total += 1
            fresh += product['status'] == 'ok'
            print(store_id, ingredient, product['status'], product.get('source', product.get('error', '')))
    print(f'Actualizados: {fresh}/{total}. Los fallos conservan su fecha anterior y se muestran como no confirmados.')
    return 0 if fresh == total and total else 2


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ValueError, OSError, RuntimeError, KeyError, TypeError, PriceError) as exc:
        print('No se pudo completar la actualización:', str(exc))
        raise SystemExit(1)

