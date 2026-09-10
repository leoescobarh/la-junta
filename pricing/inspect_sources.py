"""Diagnóstico manual de páginas públicas; solo informa estructura y errores."""
import json
import re
from urllib.parse import urljoin
from sync_prices import PublicClient, Document, PriceError, ROOT, read_config

PAGES = {
    'unimarc': ['https://www.unimarc.cl/search?q=mayonesa'],
}


def inspect_page(html):
    doc = Document(html)
    result = {'bytes': len(html), 'scripts': [], 'samples': [], 'links': [], 'structure': [], 'assets': [], 'state': {}}
    def walk(value, path=''):
        if isinstance(value, dict):
            if len(result['structure']) < 120:
                result['structure'].append({'path': path, 'keys': list(value)[:25]})
            name = value.get('displayName') or value.get('productName') or value.get('name')
            if name and any(key in value for key in ('prices', 'offers', 'price', 'variants', 'items', 'sku')) and len(result['samples']) < 3:
                result['samples'].append({'path': path, 'data': value})
                return
            for key, child in value.items():
                if isinstance(child, (dict, list)):
                    walk(child, path + '/' + key)
        elif isinstance(value, list):
            for i, child in enumerate(value[:5]):
                walk(child, path + '/' + str(i))
    for i, node in enumerate(doc.nodes):
        attrs = node['attrs']
        if node['tag'] == 'script' and attrs.get('src'):
            result['assets'].append(attrs['src'])
        if node['tag'] == 'script' and (attrs.get('type') == 'application/ld+json' or attrs.get('id') == '__NEXT_DATA__'):
            try:
                data = json.loads(node['text'])
                result['scripts'].append({'id': attrs.get('id'), 'keys': list(data)[:15] if isinstance(data, dict) else 'list'})
                walk(data)
                if attrs.get('id') == '__NEXT_DATA__':
                    props = data.get('props', {})
                    result['state'] = {'captcha': props.get('isInvalidUrlForReCaptcha'), 'pageProps': {k: str(v)[:300] for k, v in props.get('pageProps', {}).items() if k not in ('dehydratedState', 'bannerLegal')}}
            except ValueError:
                pass
        if node['tag'] == 'a' and len(result['links']) < 12 and any(x in str(attrs.get('href')) for x in ('/product/', '/articulo/', '/search', '/buscar')):
            result['links'].append(attrs['href'])
    return result


if __name__ == '__main__':
    config = read_config(ROOT / 'pricing/sources.json')
    client = PublicClient(config['stores'])
    for sid, urls in PAGES.items():
        for url in urls:
            try:
                result = inspect_page(client.get(url))
                print(json.dumps({'store': sid, 'url': url, 'result': result}, ensure_ascii=False)[:26000], flush=True)
                for asset in result['assets'][:80]:
                    if 'pages/search-' not in asset and 'search-' not in asset:
                        continue
                    if asset.startswith('/') or asset.startswith('https://www.unimarc.cl'):
                        code = client.get(urljoin(url, asset))
                        urls = sorted(set(re.findall(r'https://[a-zA-Z0-9./_-]+', code)))
                        contexts = [code[max(0, m.start()-180):m.end()+260] for m in list(re.finditer(r'intelliSearch|productSearch|searchProducts|api[./]|graphql|search\?', code, re.I))[:12]]
                        if contexts or urls:
                            print(json.dumps({'asset': asset, 'publicUrls': urls[:30], 'searchCode': contexts}, ensure_ascii=False), flush=True)
            except PriceError as error:
                print(json.dumps({'store': sid, 'url': url, 'error': error.code, 'message': str(error)}, ensure_ascii=False), flush=True)
                break

