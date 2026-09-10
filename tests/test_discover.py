import sys
from pathlib import Path
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'pricing'))
from discover import product_links, discover_product
from sync_prices import AccessBlocked, PriceError

STORE = {'origin': 'https://www.jumbo.cl', 'allowed_hosts': ['www.jumbo.cl'],
         'search_url': 'https://www.jumbo.cl/busqueda?ft=', 'product_path_pattern': r'/p/?$',
         'vtex': False, 'currency': 'CLP'}
TARGET = {'ingredient': 'mayo', 'query': 'mayonesa 800 g', 'expected_terms': ['mayonesa'],
          'expected_pattern': r'\b800\s*g\b', 'unit': 'kg', 'pack': .8}

class DiscoveryTests(unittest.TestCase):
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
