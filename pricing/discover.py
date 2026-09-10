"""Busca fichas públicas; valida identidad y formato antes de extraer precios."""
import json
import re
from urllib.parse import quote, urljoin, urlsplit


def product_links(html, store, target):
    from sync_prices import Document, normalized, safe_url, PriceError
    doc = Document(html)
    candidates = []
    def add(url, name=''):
        if not isinstance(url, str):
            return
        url = urljoin(store['origin'], url)
        try:
            safe_url(url, store['allowed_hosts'])
        except PriceError:
            return
        path = urlsplit(url).path
        if not re.search(store['product_path_pattern'], path):
            return
        text = normalized(name + ' ' + path.replace('-', ' '))
        if not all(normalized(term) in text for term in target['expected_terms']):
            return
        if url not in candidates:
            candidates.append(url)
    def walk(value):
        if isinstance(value, list):
            for item in value:
                walk(item)
        elif isinstance(value, dict):
            name = str(value.get('name') or value.get('productName') or value.get('displayName') or '')
            for key in ('url', 'link', 'productUrl', 'canonicalUrl'):
                add(value.get(key), name)
            for item in value.values():
                if isinstance(item, (dict, list)):
                    walk(item)
    for index, node in enumerate(doc.nodes):
        if node['tag'] == 'a':
            add(node['attrs'].get('href'), node['attrs'].get('title', '') + ' ' + doc.text(index))
        elif node['tag'] == 'script' and (node['attrs'].get('type') == 'application/ld+json' or node['attrs'].get('id') == '__NEXT_DATA__'):
            try:
                walk(json.loads(node['text']))
            except ValueError:
                pass
    return candidates[:3]


def discover_product(client, target, store):
    from sync_prices import PriceError, AccessBlocked, parse_vtex, parse_html, safe_url
    attempts = []
    if store.get('vtex') and store['origin'] not in getattr(client, 'unavailable_apis', set()):
        api = store['origin'] + '/api/catalog_system/pub/products/search/' + quote(target['query'], safe='')
        try:
            products = json.loads(client.get(api))
            if not isinstance(products, list):
                raise ValueError('not a product list')
            for product in products[:10]:
                if not isinstance(product, dict):
                    continue
                link = product.get('link')
                if not link:
                    continue
                try:
                    safe_url(link, store['allowed_hosts'])
                    found = parse_vtex([product], {**target, 'product_url': link}, store)
                    if found['available'] is not False:
                        return found, [{'source': 'vtex-search', 'status': 'ok'}]
                except PriceError:
                    continue
            attempts.append({'source': 'vtex-search', 'status': 'no_matching_format'})
        except AccessBlocked:
            raise
        except (PriceError, ValueError, TypeError) as error:
            code = error.code if isinstance(error, PriceError) else 'invalid_api_data'
            attempts.append({'source': 'vtex-search', 'status': code})
            if code in ('http_404', 'invalid_api_data'):
                client.unavailable_apis = getattr(client, 'unavailable_apis', set()) | {store['origin']}
    search_url = store['search_url'] + quote(target['query'], safe='')
    html = client.get(search_url)
    links = product_links(html, store, target)
    for url in links:
        try:
            found = parse_html(client.get(url), {**target, 'product_url': url}, store)
            if found['available'] is not False:
                return found, attempts + [{'source': 'html-search', 'status': 'ok'}]
        except AccessBlocked:
            raise
        except PriceError:
            continue
    raise PriceError('no_matching_public_product', 'La búsqueda pública no entregó una ficha con nombre, formato y precio verificables.')
