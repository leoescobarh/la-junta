"""Los importes de estas pruebas son sintéticos; no son cotizaciones reales."""
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'pricing'))
from browser_client import BrowserClient, page_block, public_resource, report_url
from sync_prices import parse_page, refresh_product, fingerprint, verify_name, measured_pack, read_config, PriceError, AccessBlocked

STORE = {'origin': 'https://www.unimarc.cl', 'allowed_hosts': ['www.unimarc.cl'], 'currency': 'CLP',
         'vtex': False, 'product_path_pattern': '/product/', 'browser': {'enabled': True, 'waitMilliseconds': 3000}}
TARGET = {'ingredient': 'mayo', 'expected_terms': ['mayonesa', 'prueba'], 'expected_pattern': r'800\s*g',
          'unit': 'kg', 'pack': .8, 'product_url': 'https://www.unimarc.cl/product/prueba'}


class BrowserPolicyTests(unittest.TestCase):
    def test_fixed_weight_does_not_match_the_end_of_a_decimal(self):
        target = {'expected_terms': ['lomo'], 'expected_pattern': r'\b1\s*kg\b'}
        with self.assertRaises(PriceError):
            verify_name('Lomo vetado 1.1 kg', target)
        verify_name('Lomo vetado 1 kg', target)

    def test_catalog_rejects_prepared_food_and_uses_the_declared_beef_weight(self):
        config = read_config(Path(__file__).resolve().parents[1] / 'pricing/sources.json')
        for store in config['stores'].values():
            targets = {p['ingredient']: p for p in store['products']}
            with self.assertRaises(PriceError):
                verify_name('pollo asado + papas fritas 250 g elaboración propia', targets['papasChips'])
            verify_name('Papas Fritas Artesanal Sal de Mar 250 g', targets['papasChips'])
            name = 'lomo vetado vacuno bagual negro al vacío 1.1 kg'
            verify_name(name, targets['vacuno'])
            self.assertEqual(measured_pack(name, targets['vacuno']), 1.1)

    def test_stops_on_blocks_without_treating_an_ordinary_captcha_script_as_a_block(self):
        self.assertEqual(page_block(403, 'Tienda').code, 'http_403')
        self.assertEqual(page_block(200, 'Just a moment...').code, 'challenge')
        self.assertIsNone(page_block(200, 'Supermercado', 'Nuestra política de privacidad'))

    def test_rejects_local_resources_and_removes_session_parameters_from_reports(self):
        for url in ['http://www.unimarc.cl/p', 'https://localhost/p', 'https://127.0.0.1/p', 'https://169.254.169.254/p', 'file:///tmp/x']:
            self.assertFalse(public_resource(url))
        self.assertTrue(public_resource('https://www.unimarc.cl/product/prueba'))
        self.assertEqual(report_url('https://www.unimarc.cl/p?token=private#x'), 'https://www.unimarc.cl/p')

    def test_blocked_store_is_not_retried_for_each_ingredient(self):
        client = BrowserClient({'unimarc': STORE})
        with patch.object(client, '_policy', side_effect=AccessBlocked('http_403', 'bloqueado')) as policy:
            for _ in range(3):
                with self.assertRaises(AccessBlocked):
                    client.get(TARGET['product_url'])
        self.assertEqual(policy.call_count, 1)

    def test_last_price_survives_out_of_stock_then_network_failure_with_original_date(self):
        old = {'price': 2000, 'currency': 'CLP', 'productName': 'Mayonesa Prueba 800 g',
               'productUrl': TARGET['product_url'], 'pack': .8, 'unit': 'kg', 'available': True,
               'source': 'browser-jsonld', 'fetchedAt': '2026-09-01T10:00:00Z', 'fingerprint': fingerprint(TARGET), 'status': 'ok'}
        class Client:
            def get(self, url):
                return '<script type="application/ld+json">' + json.dumps({'@type': 'Product', 'name': old['productName'], 'offers': {'price': 0, 'priceCurrency': 'CLP', 'availability': 'https://schema.org/OutOfStock'}}) + '</script>'
        unavailable = refresh_product(Client(), TARGET, STORE, old)
        self.assertEqual(unavailable['status'], 'unavailable')
        self.assertEqual(unavailable['lastValid']['price'], 2000)
        with patch.object(Client, 'get', side_effect=PriceError('network_error', 'Sin red')):
            failed = refresh_product(Client(), TARGET, STORE, unavailable)
        self.assertEqual(failed['status'], 'stale')
        self.assertEqual(failed['fetchedAt'], old['fetchedAt'])
        self.assertEqual(failed['price'], old['price'])


@unittest.skipUnless(os.environ.get('RUN_BROWSER_TESTS') == '1', 'Chromium se prueba en GitHub Actions')
class ChromiumIntegrationTests(unittest.TestCase):
    def test_javascript_product_is_rendered_and_extracted(self):
        product = {'@type': 'Product', 'name': 'Mayonesa Prueba 800 g', 'offers': {'price': 1234, 'priceCurrency': 'CLP'}}
        page = '<html><title>Ficha de prueba</title><body><a href="/product/relacionado">Otro producto</a><script>setTimeout(() => {const s=document.createElement("script");s.type="application/ld+json";s.textContent=' + json.dumps(json.dumps(product)) + ';document.body.appendChild(s)}, 150)</script></body></html>'
        client = BrowserClient({'unimarc': STORE}, delay=1)
        try:
            client._ensure_browser()
            # Todo el tráfico se responde con la fixture local: esta prueba no
            # solicita páginas a supermercados ni modifica el catálogo real.
            client.context.route('**/*', lambda route: route.fulfill(status=200, content_type='text/html', body=page))
            with patch.object(client, '_policy'):
                result = parse_page(client, client.get(TARGET['product_url']), TARGET, STORE)
            self.assertEqual(result['price'], 1234)
            self.assertEqual(result['source'], 'browser-jsonld')
            self.assertEqual(client.report()['pagesRead'], 1)
        finally:
            client.close()
