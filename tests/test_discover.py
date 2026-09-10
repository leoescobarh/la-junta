import sys
from pathlib import Path
import unittest
import json
import runpy
import tempfile
from email.message import Message
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'pricing'))
from discover import product_links, discover_product
from sync_prices import AccessBlocked, PriceError
from sync_prices import verify_name

STORE = {'origin': 'https://www.jumbo.cl', 'allowed_hosts': ['www.jumbo.cl'],
         'search_url': 'https://www.jumbo.cl/busqueda?ft=', 'product_path_pattern': r'/p/?$',
         'vtex': False, 'currency': 'CLP'}
TARGET = {'ingredient': 'mayo', 'query': 'mayonesa 800 g', 'expected_terms': ['mayonesa'],
          'expected_pattern': r'\b800\s*g\b', 'unit': 'kg', 'pack': .8}

class DiscoveryTests(unittest.TestCase):
    def test_ingredient_is_not_an_incidental_word_in_another_product(self):
        salt = {'expected_terms': ['sal', 'fina'], 'expected_pattern': r'\b1\s*kg\b', 'name_pattern': r'^sal\b', 'excluded_terms': ['mani']}
        verify_name('Sal Fina Cuisine & Co 1 kg', salt)
        with self.assertRaises(PriceError):
            verify_name('Maní con sal fina 1 kg', salt)
        with self.assertRaises(PriceError):
            verify_name('Sal Fina Pack de 6 bolsas 1 kg', salt)

    def test_cli_publishes_a_missing_search_as_error_instead_of_crashing(self):
        class Response:
            headers = Message()
            headers['Content-Type'] = 'text/html; charset=utf-8'
            def __init__(self, url):
                self.body = b'User-agent: *\nAllow: /\n' if url.endswith('/robots.txt') else b'<html>No results</html>'
            def read(self, limit):
                return self.body[:limit]
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
        class Opener:
            def open(self, request, timeout):
                return Response(request.full_url)
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / 'sources.json'
            output = Path(directory) / 'prices.json'
            config.write_text(json.dumps({'schemaVersion': 1, 'stores': {'jumbo': {**STORE, 'name': 'Jumbo', 'scope': 'test', 'products': [TARGET]}}}))
            args = ['sync_prices.py', '--config', str(config), '--output', str(output)]
            with patch.object(sys, 'argv', args), patch('urllib.request.build_opener', return_value=Opener()), patch('time.sleep'), self.assertRaises(SystemExit) as stopped:
                runpy.run_path(str(Path(__file__).resolve().parents[1] / 'pricing/sync_prices.py'), run_name='__main__')
            self.assertEqual(stopped.exception.code, 2)
            self.assertEqual(json.loads(output.read_text())['stores']['jumbo']['products']['mayo']['status'], 'error')

    def test_links_are_matching_products_on_approved_host(self):
        html = '<a href="https://evil.test/mayonesa/p">Mayonesa</a><a href="/mayonesa/p">Mayonesa</a><a href="/mayonesa">Categoría</a><a href="/arroz/p">Arroz</a>'
        self.assertEqual(product_links(html, STORE, TARGET), ['https://www.jumbo.cl/mayonesa/p'])

    def test_search_then_product_extracts_real_format(self):
        class Client:
            def get(self, url):
                if 'busqueda?' in url:
                    return '<a href="/mayonesa/p">Mayonesa 800 g</a>'
                return '<script type="application/ld+json">{"@type":"Product","name":"Mayonesa 800 g","offers":{"price":3530,"priceCurrency":"CLP","availability":"https://schema.org/InStock"}}</script>'
        result, attempts = discover_product(Client(), TARGET, STORE)
        self.assertEqual(result['price'], 3530)
        self.assertEqual(result['productUrl'], 'https://www.jumbo.cl/mayonesa/p')
        self.assertEqual(result['pack'], .8)
        self.assertEqual(attempts[-1]['status'], 'ok')

    def test_block_stops_instead_of_trying_other_routes(self):
        class Client:
            calls = 0
            def get(self, url):
                self.calls += 1
                raise AccessBlocked('http_403', 'blocked')
        client = Client()
        with self.assertRaises(AccessBlocked):
            discover_product(client, TARGET, {**STORE, 'vtex': True})
        self.assertEqual(client.calls, 1)

    def test_wrong_pack_is_never_assigned_to_ingredient(self):
        class Client:
            def get(self, url):
                if 'busqueda?' in url:
                    return '<a href="/mayonesa/p">Mayonesa</a>'
                return '<script type="application/ld+json">{"@type":"Product","name":"Mayonesa 250 g","offers":{"price":1000,"priceCurrency":"CLP"}}</script>'
        with self.assertRaises(PriceError):
            discover_product(Client(), TARGET, STORE)

