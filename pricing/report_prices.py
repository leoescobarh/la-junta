"""Resumen de cobertura y copia completa del snapshot de esta ejecución."""
from collections import Counter
import json
import os
from pathlib import Path
from sync_prices import ROOT, atomic_write, save_snapshot


def publish_report(snapshot, report_dir, run_url=None):
    if run_url:
        snapshot['runUrl'] = run_url
    rows = []
    health = {'generatedAt': snapshot['generatedAt'], 'runUrl': snapshot.get('runUrl'), 'stores': {}}
    for sid, store in snapshot['stores'].items():
        products = store.get('products', {})
        counts = Counter(p['status'] for p in products.values())
        errors = Counter(p['error'] for p in products.values() if p.get('error'))
        health['stores'][sid] = {'engine': store.get('engine', 'http'), 'configured': store['configured'],
                                'fresh': counts['ok'], 'stale': counts['stale'], 'unavailable': counts['unavailable'],
                                'missing': counts['error'], 'errors': dict(errors)}
        rows.append(f"| {store['name']} | {store.get('engine', 'http')} | {counts['ok']}/{store['configured']} | {counts['stale']} | {counts['unavailable']} | {counts['error']} |")
    report_dir.mkdir(parents=True, exist_ok=True)
    atomic_write(report_dir / 'health.json', json.dumps(health, ensure_ascii=False, indent=2) + '\n')
    save_snapshot(snapshot, report_dir / 'prices.json')
    md = '# Cobertura de precios\n\nLos precios anteriores conservan su fecha real y no compiten como vigentes.\n\n| Tienda | Motor | Vigentes | Anteriores | Sin stock | Sin precio |\n| --- | --- | --- | --- | --- | --- |\n' + '\n'.join(rows) + '\n'
    atomic_write(report_dir / 'coverage.md', md)
    return md


if __name__ == '__main__':
    snapshot = json.loads((ROOT / 'dist/prices.json').read_text())
    run_url = None
    if os.environ.get('GITHUB_RUN_ID') and os.environ.get('GITHUB_REPOSITORY'):
        run_url = f"https://github.com/{os.environ['GITHUB_REPOSITORY']}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
    md = publish_report(snapshot, ROOT / 'artifacts/pricing', run_url)
    save_snapshot(snapshot, ROOT / 'dist/prices.json')
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as report:
            report.write(md)
    print(md)
