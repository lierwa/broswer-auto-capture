"""Refresh public DB-IP country/ASN data using the original CrowdSec MMDB reader."""
import argparse
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

from lab_paths import ROOT, BASE


def digest(file): return hashlib.sha256(file.read_bytes()).hexdigest()


def wsl(*args):
    return subprocess.run(['wsl', '-d', 'Ubuntu', '--exec', *args], cwd=ROOT, capture_output=True, check=True).stdout.decode().strip()


def download(out):
    month = datetime.now(timezone.utc).strftime('%Y-%m')
    rows = []
    for source, target in [('country', 'City'), ('asn', 'ASN')]:
        url = f'https://download.db-ip.com/free/dbip-{source}-lite-{month}.mmdb.gz'
        archive, file = out/(source+'.gz'), out/('GeoLite2-'+target+'.mmdb')
        subprocess.run(['curl.exe', '--fail', '--location', '--silent', '--show-error', '--max-time', '90',
            '--max-filesize', '16000000', '--output', str(archive), url], cwd=ROOT, check=True)
        with gzip.open(archive, 'rb') as stream: data = stream.read(64_000_001)
        if len(data) > 64_000_000: raise ValueError('geo_data_capacity')
        file.write_bytes(data)
        rows.append(dict(source=url, file=file.name, sha256=digest(file), bytes=len(data)))
    (out/'source.json').write_text(json.dumps(rows, indent=2))


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--candidate', type=Path)
    args = parser.parse_args()
    base = wsl('wslpath', '-a', str(BASE))
    owner = json.loads((BASE/'prepared.json').read_text())
    checkout = wsl('wslpath', '-a', str(ROOT))
    if owner['base'] != base or owner['checkout'] != checkout: raise ValueError('lab_owner_changed')
    for unit in ['bat-antibot-engine', 'bat-antibot-window-test']:
        if wsl('systemctl', '--user', 'show', unit+'.service', '--property=ActiveState', '--value') not in ('inactive', 'failed', ''):
            raise ValueError('stop_owned_engine_before_geo_refresh')
    out = args.candidate.resolve() if args.candidate else Path(tempfile.mkdtemp(prefix='geo-source-', dir=BASE/'reports'))
    if not out.is_relative_to(BASE/'reports') or out.is_symlink() or out.is_junction(): raise ValueError('geo_candidate_owner')
    if not args.candidate: download(out)
    rows = json.loads((out/'source.json').read_text())
    if {row['file'] for row in rows} != {'GeoLite2-City.mmdb', 'GeoLite2-ASN.mmdb'} or len(rows) != 2:
        raise ValueError('geo_candidate_files')
    for row in rows:
        file = out/row['file']
        if file.is_symlink() or file.is_junction() or digest(file) != row['sha256'] or file.stat().st_size != row['bytes']:
            raise ValueError('geo_candidate_digest')
    module = base+'/runtime/crowdsec-909b5157986a2b2c2163300fdaef5ed01289f7d2'
    target = wsl('wslpath', '-a', str(out))
    log = wsl('env', 'GOFLAGS=-mod=readonly', 'go', '-C', module, 'run',
        checkout+'/tests/geoip-calibration.go', target, target+'/current.json', '--current')
    (out/'deployment-check.log').write_text(log)
    validated = json.loads((out/'current.json').read_text())
    if (BASE/'data').is_symlink() or (BASE/'data').is_junction(): raise ValueError('geo_data_link')
    receipt = BASE/'geo-source.json'
    if receipt.is_symlink() or receipt.is_junction(): raise ValueError('geo_receipt_link')
    backup = Path(tempfile.mkdtemp(prefix='before-geo-', dir=BASE/'reports'))
    if receipt.exists(): shutil.copyfile(receipt, backup/receipt.name)
    for row in rows:
        final = BASE/'data'/row['file']
        if final.is_symlink() or final.is_junction(): raise ValueError('geo_existing_link')
        if final.exists(): shutil.copyfile(final, backup/final.name)
        pending = final.with_suffix('.pending')
        with pending.open('xb') as stream: stream.write((out/row['file']).read_bytes())
        pending.replace(final)
    receipt.write_text(json.dumps(dict(source='https://db-ip.com/db/lite.php', license='CC-BY-4.0',
        attribution=validated['attribution'], expires=validated['expires'], metadata=validated['metadata'],
        files=rows, cityCoordinatesAvailable=False, evidence=str(out)), indent=2))
    print(json.dumps(dict(installed=True, engineStarted=False, evidence=str(out), backup=str(backup))))


if __name__ == '__main__': main()
