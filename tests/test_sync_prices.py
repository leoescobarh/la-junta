"""Pruebas sin red con respuestas sintéticas; no son precios observados."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'pricing'))
import sync_prices as s

TARGET = {'ingredient': 'panCompleto', 'product_url': 'https://www.jumbo.cl/pan-prueba/p',
          'unit': 'un', 'pack': 8, 'expected_terms': ['pan', 'prueba'], 'expected_pattern': r'\b8\s*un'}
STORE = {'name': 'Tienda de prueba', 'origin': 'https://www.jumbo.cl', 'allowed_hosts': ['www.jumbo.cl'],
         'currency': 'CLP', 'seller_id': '1', 'scope': 'Prueba sin red', 'products': [TARGET]}
NAME = 'Pan Prueba 8 un.'


def api(price=1990, stock=10):
    return [{'link': TARGET['product_url'], 'productName': NAME, 'items': [
        {'itemId': '8', 'nameComplete': NAME, 'sellers': [
            {'sellerId': '1', 'commertialOffer': {'Price': price, 'AvailableQuantity': stock, 'PriceValidUntil': '2099-01-01'}}]}]}]


def html(offer=None, name=NAME):
    product = {'@type': 'Product', 'name': name, 'url': TARGET['product_url'], 'offers': offer or {
        '@type': 'Offer', 'price': 2190, 'priceCurrency': 'CLP', 'availability': 'https://schema.org/InStock'}}
    return '<html><script type="application/ld+json">' + json.dumps({'@graph': [product]}) + '</script></html>'


class Client:
    def __init__(self, *responses):
        self.responses = iter(responses)
        self.calls = []

    def get(self, url):
        self.calls.append(url)
        value = next(self.responses)
        if isinstance(value, Exception):
            raise value
        return value


class SyncTests(unittest.TestCase):
    def test_vtex_priority_and_exact_route(self):
        client = Client(json.dumps(api()))
        product = s.refresh_product(client, TARGET, STORE)
        self.assertEqual(product['price'], 1990)
        self.assertEqual(product['source'], 'vtex')
        self.assertEqual(client.calls, ['https://www.jumbo.cl/api/catalog_system/pub/products/search/pan-prueba/p'])

    def test_api_missing_invalid_or_incomplete_falls_back_to_html(self):
        for response in ['[]', '<html>Sin API</html>', json.dumps([{'link': TARGET['product_url'], 'items': [None]}]), s.PriceError('http_404', 'No hay API')]:
            with self.subTest(response=response):
                client = Client(response, html())
                product = s.refresh_product(client, TARGET, STORE)
                self.assertEqual(product['source'], 'html-jsonld')
                self.assertEqual(product['price'], 2190)
                self.assertEqual(len(client.calls), 2)

    def test_html_only_store_skips_vtex(self):
        client = Client(html())
        result = s.refresh_product(client, TARGET, {**STORE, 'vtex': False})
        self.assertEqual(client.calls, [TARGET['product_url']])
        self.assertEqual(result['status'], 'ok')

    def test_blocked_api_does_not_try_html(self):
        for code in ['http_401', 'http_403', 'http_429', 'robots_denied', 'challenge']:
            client = Client(s.AccessBlocked(code, 'Acceso limitado'))
            result = s.refresh_product(client, TARGET, STORE)
            self.assertEqual(result['status'], 'error')
            self.assertEqual(result['error'], code)
            self.assertEqual(len(client.calls), 1)

    def test_out_of_stock_is_not_zero_cost_and_does_not_fallback(self):
        client = Client(json.dumps(api(price=0, stock=0)))
        result = s.refresh_product(client, TARGET, STORE)
        self.assertEqual(result['status'], 'unavailable')
        self.assertIsNone(result['price'])
        self.assertEqual(len(client.calls), 1)

    def test_changed_product_name_or_pack_is_rejected(self):
        with self.assertRaises(s.PriceError):
            s.parse_html(html(name='Pan Prueba 12 un.'), TARGET, STORE)
        payload = api()
        payload[0]['link'] = 'https://www.jumbo.cl/otro-pan/p'
        with self.assertRaises(s.PriceError):
            s.parse_vtex(payload, TARGET, STORE)

    def test_multiple_skus_require_explicit_selection(self):
        payload = api()
        other = copy.deepcopy(payload[0]['items'][0])
        other['itemId'] = '9'
        payload[0]['items'].append(other)
        with self.assertRaises(s.PriceError):
            s.parse_vtex(payload, TARGET, STORE)
        self.assertEqual(s.parse_vtex(payload, {**TARGET, 'sku_id': '8'}, STORE)['price'], 1990)

    def test_multiple_or_conditional_offers_are_not_minimized(self):
        offer = {'@type': 'Offer', 'price': 1000, 'priceCurrency': 'CLP'}
        for offers in [[offer, offer], {**offer, 'eligibleMembershipTier': 'club'}, {'@type': 'AggregateOffer', 'lowPrice': 990, 'priceCurrency': 'CLP'}]:
            with self.subTest(offers=offers), self.assertRaises(s.PriceError):
                s.parse_html(html(offers), TARGET, STORE)

    def test_currency_and_expired_offer_are_rejected(self):
        for changes in [{'priceCurrency': 'USD'}, {'priceValidUntil': '2000-01-01'}, {'price': 0}]:
            with self.assertRaises(s.PriceError):
                s.parse_html(html({'price': 1000, 'priceCurrency': 'CLP', **changes}), TARGET, STORE)

    def test_metadata_and_specific_selectors(self):
        meta = '<meta property="og:title" content="Pan Prueba 8 un."><meta property="product:price:amount" content="2490"><meta property="product:price:currency" content="CLP">'
        self.assertEqual(s.parse_html(meta, TARGET, STORE)['source'], 'html-meta')
        target = {**TARGET, 'html_selectors': {'name': 'h1', 'price': '[data-test="price"]', 'price_locale': 'es-CL'}}
        page = '<h1>Pan Prueba 8 un.</h1><span data-test="price">$2.490</span>'
        result = s.parse_html(page, target, STORE)
        self.assertEqual(result['price'], 2490)
        self.assertEqual(result['source'], 'html-selector')
        with self.assertRaises(s.PriceError):
            s.parse_html(page + '<span data-test="price">$1.990</span>', target, STORE)

    def test_unrelated_recommendation_is_not_a_product_price(self):
        value = {'@type': 'ItemList', 'itemListElement': [{'@type': 'Product', 'name': NAME, 'offers': {'price': 1, 'priceCurrency': 'CLP'}}]}
        with self.assertRaises(s.PriceError):
            s.parse_html('<script type="application/ld+json">' + json.dumps(value) + '</script>', TARGET, STORE)

    def test_failure_preserves_actual_observation_date(self):
        previous = s.refresh_product(Client(json.dumps(api())), TARGET, STORE, checked_at='2026-09-01T10:00:00Z')
        result = s.refresh_product(Client('[]', s.PriceError('network_error', 'Sin red')), TARGET, STORE, previous, '2026-09-09T10:00:00Z')
        self.assertEqual(result['status'], 'stale')
        self.assertEqual(result['price'], 1990)
        self.assertEqual(result['fetchedAt'], '2026-09-01T10:00:00Z')
        self.assertEqual(result['checkedAt'], '2026-09-09T10:00:00Z')

    def test_changing_product_mapping_does_not_reuse_an_old_price(self):
        previous = s.refresh_product(Client(json.dumps(api())), TARGET, STORE)
        target = {**TARGET, 'pack': 12}
        result = s.refresh_product(Client('[]', '<html></html>'), target, STORE, previous)
        self.assertEqual(result['status'], 'error')
        self.assertNotIn('price', result)

    def test_price_parsing_never_turns_thousands_into_pesos(self):
        self.assertEqual(s.parse_price('$1.990', 'es-CL'), 1990)
        self.assertEqual(s.parse_price('CLP 1.990,50', 'es-CL'), 1991)
        self.assertEqual(s.parse_price('1990.0'), 1990)
        for value in [None, True, 'nan', 'inf', 0, -5, '1.990.000', '2 por 1000']:
            with self.subTest(value=value), self.assertRaises(s.PriceError):
                s.parse_price(value)

    def test_robots_wildcards_and_specific_groups(self):
        rules, delay = s.parse_robots('User-agent: *\nDisallow: /api/\nDisallow: /*?sc=\nAllow: /api/public/\nCrawl-delay: 3\n')
        self.assertEqual(delay, 3)
        self.assertFalse(s.robots_allows(rules, 'https://www.jumbo.cl/api/private'))
        self.assertTrue(s.robots_allows(rules, 'https://www.jumbo.cl/api/public/item'))
        self.assertFalse(s.robots_allows(rules, 'https://www.jumbo.cl/p?sc=2'))
        rules, _ = s.parse_robots('User-agent: *\nDisallow: /\nUser-agent: LaJuntaPriceBot\nAllow: /\n')
        self.assertTrue(s.robots_allows(rules, TARGET['product_url']))

    def test_unverifiable_robots_prevents_product_fetch(self):
        client = s.PublicClient({'test': STORE})
        with patch.object(client, '_raw', side_effect=s.PriceError('network_error', 'Sin conexión')) as raw:
            with self.assertRaises(s.AccessBlocked):
                client.get(TARGET['product_url'])
        self.assertEqual(raw.call_count, 1)

    def test_redirect_outside_allowlist_is_not_fetched(self):
        client = s.PublicClient({'test': STORE})
        with patch.object(client, '_policy'), patch.object(client, '_raw', return_value=({'redirect': 'https://otro.example/p'}, '')) as raw:
            with self.assertRaises(s.PriceError):
                client.get(TARGET['product_url'])
        self.assertEqual(raw.call_count, 1)

    def test_snapshot_json_and_offline_script_are_consistent(self):
        config = {'schemaVersion': 1, 'stores': {'test': STORE}}
        snapshot = s.sync(config, {}, Client(json.dumps(api())))
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'prices.json'
            s.save_snapshot(snapshot, output)
            self.assertEqual(json.loads(output.read_text()), snapshot)
            js = output.with_name('prices-snapshot.js').read_text()
            self.assertEqual(json.loads(js.removeprefix('globalThis.JuntaPriceSnapshot = ').rstrip().removesuffix(';')), snapshot)
            self.assertEqual(list(Path(directory).glob('*.tmp')), [])


if __name__ == '__main__':
    unittest.main()
