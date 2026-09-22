"""Busca fichas públicas; valida identidad y formato antes de extraer precios."""
import json
import re
from urllib.parse import quote, urljoin, urlsplit, urlunsplit, parse_qsl


TRACKING_PARAMS = {'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
                   'from', 'query', 'search', 'ft', 'ntt', 'q'}


def _candidate_key(url):
    """Deduplica la misma ficha enlazada desde distintos resultados de búsqueda."""
    parsed = urlsplit(url)
    query = tuple((key, value) for key, value in parse_qsl(parsed.query, keep_blank_values=True)
                  if key.lower() not in TRACKING_PARAMS and not key.lower().startswith('utm_'))
    return urlunsplit((parsed.scheme.lower(), (parsed.hostname or '').lower(),
                       parsed.path.rstrip('/'), '&'.join(f'{k}={v}' for k, v in query), ''))


def _search_queries(target):
    """Ordena consultas explícitas y genera dos respaldos pequeños y auditables."""
    values = []
    for value in target.get('search_queries', []):
        if isinstance(value, str) and value.strip():
            values.append(value.strip())
    for value in (target.get('query'), target.get('label')):
        if isinstance(value, str) and value.strip():
            values.append(value.strip())
    terms = [str(value).strip() for value in target.get('expected_terms', []) if str(value).strip()]
    if terms:
        values.append(' '.join(terms))
    # Una consulta sin gramaje suele devolver la ficha actual aunque cambie el
    # título o el formato; la verificación final sigue siendo estricta.
    for value in tuple(values):
        short = re.sub(r'\b\d+(?:[.,]\d+)?\s*(?:kg|kilo?s?|g|grs?|ml|cc|l|litros?|un(?:idades?|id?s?)?)\b', '', value, flags=re.I)
        short = re.sub(r'\s+', ' ', short).strip(' -')
        if short and short not in values:
            values.append(short)
    return list(dict.fromkeys(values))[:3]


def product_links(html, store, target):
    from sync_prices import Document, normalized, safe_url, PriceError, product_identity
    doc = Document(html)
    candidates = []
    seen = set()
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
        terms = target.get('discovery_terms', target.get('expected_terms', []))
        if not all(normalized(term) in text for term in terms):
            return
        if any(normalized(term) in text for term in target.get('excluded_terms', [])):
            return
        key = _candidate_key(url)
        if key in seen:
            return
        seen.add(key)
        # Prioriza enlaces cuyo texto ya declara el formato esperado. La
        # página se vuelve a validar con verify_name antes de aceptar precio.
        pattern = target.get('expected_pattern')
        score = 1 if pattern and re.search(pattern, text, re.I) else 0
        candidates.append((score, len(candidates), url))
    def walk(value):
        if isinstance(value, list):
            for item in value:
                walk(item)
        elif isinstance(value, dict):
            name = product_identity(value)
            for key in ('url', 'link', 'productUrl', 'canonicalUrl'):
                add(value.get(key), name)
            if store.get('slug_prefix') and value.get('productName') and value.get('linkText'):
                add(store['slug_prefix'] + value['linkText'], name)
            for item in value.values():
                if isinstance(item, (dict, list)):
                    walk(item)
    for index, node in enumerate(doc.nodes):
        if node['tag'] == 'a':
            add(node['attrs'].get('href'), node['attrs'].get('title', '') + ' ' + doc.text(index))
        elif node['tag'] == 'script' and (node['attrs'].get('type') == 'application/ld+json' or node['attrs'].get('id') == '__NEXT_DATA__' or node['attrs'].get('data-junta-catalog') == 'true'):
            try:
                walk(json.loads(node['text']))
            except ValueError:
                pass
    candidates.sort(key=lambda value: (-value[0], value[1]))
    return [url for _, _, url in candidates[:store.get('candidate_limit', 8)]]


def discover_product(client, target, store):
    from sync_prices import PriceError, AccessBlocked, parse_vtex, parse_page, safe_url
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
                    link = urljoin(store['origin'], link)
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
    queries = _search_queries(target)
    for query_index, query in enumerate(queries):
        search_url = store['search_url'] + quote(query, safe='')
        try:
            html = client.get(search_url)
        except AccessBlocked:
            raise
        except PriceError as error:
            attempts.append({'source': 'html-search', 'query': query, 'status': error.code})
            continue
        # La consulta puede ser amplia: el título de resultados a menudo
        # abrevia marca o descripción. La ficha todavía pasa la identidad y
        # formato completos en parse_page.
        discovery_terms = target.get('discovery_terms')
        if not discovery_terms:
            discovery_terms = target.get('expected_terms', [])[:3]
        links = product_links(html, store, {**target, 'discovery_terms': discovery_terms})
        attempts.append({'source': 'html-search', 'query': query, 'url': search_url, 'candidates': len(links)})
        for url in links:
            try:
                found = parse_page(client, client.get(url), {**target, 'product_url': url}, store)
                if found['available'] is not False:
                    return found, attempts + [{'source': 'html-search', 'status': 'ok', 'query': query}]
            except AccessBlocked:
                raise
            except PriceError as error:
                attempts.append({'source': 'html-product', 'url': url, 'status': error.code, 'query': query})
                continue
    raise PriceError('no_matching_public_product', 'La búsqueda pública no entregó una ficha con nombre, formato y precio verificables.', attempts)
