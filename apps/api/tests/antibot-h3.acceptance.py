"""Persistent full-shield WSL H3 ingress, native B-A-T and mixed-stack control."""
import asyncio, base64, hashlib, importlib.util, ipaddress, json, os, shutil, subprocess, sys, tempfile
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlsplit
from uuid import uuid4
from cryptography import x509
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
ROOT = Path.cwd().resolve(); BASE = ROOT/'work/antibot-service'
sys.path[:0] = [str(ROOT/'apps/api/python')]
spec=importlib.util.spec_from_file_location('online',ROOT/'apps/api/tests/antibot-online.acceptance.py')
online=importlib.util.module_from_spec(spec); spec.loader.exec_module(online)
from browser_use_runner.managed_window import ManagedWindow, _profile_process_present
sys.path.insert(0, str(ROOT/'tools/antibot-lab'))
from edge_h2_online import QUIC_FIELDS, quic_observation, quic_shape_observation


def parameter_boundaries():
    normal = [30000, 65527, 2**61, 6, 7, 8, 100, 100, 3, 25, 2, 0]
    def check(values): return quic_observation({'alpn': 'h3', 'quic_params': ';'.join(map(str, values))})
    assert check(normal)[1] is None and check(normal)[0]['initial_max_data'] == 2**61
    for index, invalid in [(0, 2**62), (1, 1199), (6, 2**60+1), (8, 21), (9, 2**14), (10, 1), (11, 2)]:
        values = normal.copy(); values[index] = invalid
        assert check(values)[1] == 'quic_parameters_invalid'
    assert check(normal[:-1])[1] == 'quic_parameters_unavailable'
    assert quic_observation({'alpn': 'h3'})[1] == 'quic_parameters_unavailable'
    assert quic_observation({'alpn': 'h2'})[1] == 'http3_not_negotiated'
    values = normal.copy(); values[1] = 2**61  # RFC只禁止小于1200；大声明仍是有效参数。
    assert check(values)[1] is None
    shape = lambda raw: quic_shape_observation({'alpn': 'h3', 'quic_shape': raw})
    first, reason = shape('15:8;4:4;27:5;1099511627776:0;')
    second, _ = shape('58:20;1099511627776:0;4:8;15:8;12583:4;')
    assert reason is None and first['stableIds'] == second['stableIds'] == [4, 15, 1099511627776]
    assert first['parameters'] != second['parameters'] and first['initialSourceCidLength'] == 8
    assert shape('15:0;' + ''.join(f'{i+100}:0;' for i in range(127)))[1] is None
    for value in ['15:21;', '15:0;15:0;', '15:0;4611686018427387904:0;', '15:0;4:65536;']:
        assert shape(value)[1] == 'quic_shape_invalid'
    assert shape('15:0;' + ''.join(f'{i+100}:0;' for i in range(128)))[1] == 'quic_shape_unavailable'
    assert shape('capacity')[1] == 'quic_shape_capacity'
    assert shape('4:4;')[1] == 'quic_shape_invalid'
    assert shape('15:0')[1] == 'quic_shape_unavailable'

def wsl(*args):
    return subprocess.run(['wsl','-d','Ubuntu','--exec',*args], capture_output=True,check=True,cwd=ROOT).stdout.decode().strip()
def linux(p): return wsl('wslpath','-a',p.as_posix())
def rows(p): return [json.loads(line) for line in p.read_text().splitlines() if line.startswith('{')]


def independent(out):
    data=wsl('tshark','-r',linux(out/'capture.pcapng'),'-Y','tls.handshake.type == 1',
             '-T','fields','-e','quic.version','-e','tls.handshake.ja4','-e','tls.handshake.extensions_alpn_str')
    parsed=[line.split('\t') for line in data.splitlines() if line]
    actual={row['ja4'] for row in json.loads((out/'mixed.json').read_text())['transport']}
    alternative=json.loads((out/'alpn.json').read_text())
    actual.update(row['ja4'] for row in alternative)
    assert actual and actual <= {row[1] for row in parsed}
    assert all(row[0]=='0x00000001' and row[2] in ('h3', 'x-lab-9,h3') for row in parsed)
    assert any(row[2]=='x-lab-9,h3' for row in parsed)
    online.save(out,'independent.json',{'actualJa4':sorted(actual),'tshark':parsed,
        'allObservedMatched':True,'tlsKeysSaved':False,'firstAdvertisementDiffersFromNegotiated':True})
    arguments = ['tshark', '-r', linux(out/'capture.pcapng'), '-Y', 'tls.handshake.type == 1',
        '-T', 'fields', '-e', 'quic.version']
    for field in QUIC_FIELDS[:-1]: arguments.extend(['-e', 'tls.quic.parameter.' + field])
    arguments.extend(['-e', 'tls.quic.parameter.type'])
    defaults = [0, 65527, 0, 0, 0, 0, 0, 0, 3, 25, 2]
    decoded = set()
    for line in wsl(*arguments).splitlines():
        fields = line.split('\t')
        if len(fields) != 13: continue
        values = [int(value.split(',')[0]) if value else default for value, default in zip(fields[1:12], defaults)]
        values.append(int(12 in [int(value, 0) for value in fields[12].split(',') if value]))
        decoded.add(tuple(values))
    observed = {tuple(row['facts'][field] for field in QUIC_FIELDS)
        for row in json.loads((out/'normal-quic-parameters.json').read_text())}
    controls = json.loads((out/'controlled-quic-parameters.json').read_text())
    observed.update(tuple(row['facts'][field] for field in QUIC_FIELDS) for row in controls)
    online.save(out, 'independent-quic.json', {'fields': QUIC_FIELDS, 'native': sorted(observed), 'tshark': sorted(decoded)})
    assert observed and observed <= decoded, 'native_quic_parameters_disagree_with_tshark'
    independent_shape(out)


def independent_shape(out):
    raw = wsl('tshark', '-r', linux(out/'capture.pcapng'), '-Y', 'tls.handshake.type == 1',
        '-T', 'fields', '-e', 'tls.quic.parameter.type', '-e', 'tls.quic.parameter.length')
    decoded = set()
    for line in raw.splitlines():
        ids, lengths = line.split('\t')
        keys, sizes = [int(v, 0) for v in ids.split(',')], list(map(int, lengths.split(',')))
        assert len(keys) == len(sizes)
        decoded.add(tuple(zip(keys, sizes)))
    samples = json.loads((out/'mixed-quic-shape.json').read_text())['observations']
    samples += json.loads((out/'wide-quic-shape.json').read_text())['observations']
    observed = {tuple((p['ID'], p['Length']) for p in row['facts']['parameters']) for row in samples}
    online.save(out, 'independent-quic-shape.json', {'native': sorted(observed), 'tshark': sorted(decoded),
        'allMatched': bool(observed) and observed <= decoded, 'parameterContentsSaved': False})
    assert observed and observed <= decoded, 'native_quic_shape_disagrees_with_tshark'


def shape_proof(out, case, before, normal):
    observed = [row for row in online.observations(case) if row['category'] == 'quic-shape']
    alerts = [row for row in online.alerts() if row['id'] not in before and row['scenario'] == 'bat-lab/quic-shape']
    online.save(out, ('normal' if normal else 'mixed') + '-quic-shape.json', {'observations': observed, 'alerts': alerts})
    assert observed and all(row['valid'] == 'true' for row in observed)
    if normal:
        assert len({row['protocol_family'] for row in observed}) == 1 and not alerts, 'normal_shape_false_positive'
    else:
        assert alerts and len({row['protocol_family'] for row in observed}) > 1, 'quic_shape_mixed_stack_not_detected'


async def settings_controls(out, ip, base, output):
    for label, extra in [('wide', {str(2**61 + 7): 2**60 + 17}),
                         ('capacity', {str(10000 + i): i for i in range(257)})]:
        case = online.local('/api/cases', {'kind': 'catalog'})
        target = urlsplit(case['url'])
        body = json.dumps({'URL': 'https://' + ip + ':4183' + target.path, 'Host': target.hostname + ':4183',
            'UA': 'B-A-T-owned-H3-settings-control', 'Cookie': '', 'CA': base + '/tls/cert.pem', 'Settings': extra})
        await asyncio.to_thread(subprocess.run, ['wsl', '-d', 'Ubuntu', '--exec', output + '/control-client'],
            input=body.encode(), capture_output=True, timeout=15, check=True, cwd=ROOT)
        await asyncio.sleep(.6)
        actual = [row for row in online.observations(case) if row['category'] == 'h3-continuity']
        online.save(out, label + '-settings.json', {'expectedExtras': extra, 'observed': actual})
        assert actual, 'h3_control_not_measured'
        if label == 'wide':
            assert all(row['valid'] == 'true' for row in actual)
            assert all({str(p['ID']): p['Value'] for p in row['facts']['Settings']}.items() >= extra.items() for row in actual)
        else:
            assert all(row['valid'] == 'false' and row['reason'] == 'settings_capacity' for row in actual)


async def controlled_parameters(out, ip, base, output):
    changed = online.local('/api/cases', {'kind': 'catalog'})
    target = urlsplit(changed['url'])
    body = json.dumps({'URL': 'https://' + ip + ':4183' + target.path,
        'Host': target.hostname + ':4183', 'UA': 'owned-quic-parameter-control',
        'CA': base + '/tls/cert.pem', 'MaxIdleMs': 17000})
    await asyncio.to_thread(subprocess.run, ['wsl', '-d', 'Ubuntu', '--exec', output + '/control-client'],
        input=body.encode(), capture_output=True, timeout=15, check=True, cwd=ROOT)
    await asyncio.sleep(.6)
    observed = [row for row in online.observations(changed) if row['category'] == 'quic-continuity']
    online.save(out, 'controlled-quic-parameters.json', observed)
    assert observed and all(row['valid'] == 'true' and row['facts']['max_idle_timeout'] == 17000 for row in observed)


async def shape_controls(out, ip, base, output):
    # 固定quic-go原测试扩展点只用于独立发送器；不改模块缓存/产品网络，不重写编码器。
    module = wsl('go', 'env', 'GOMODCACHE') + '/github.com/quic-go/quic-go@v0.55.0'
    workspace = out/'shape-control'; workspace.mkdir()
    original = (ROOT/'apps/api/tests/antibot-m0/quic-control-client.go').read_text()
    source = original.replace('"context"', '"context"\n "github.com/quic-go/quic-go/internal/wire"')
    source = source.replace('MaxIdleMs uint64 }', 'MaxIdleMs uint64; Parameters map[uint64][]byte }')
    source = source.replace('cert,err:=os.ReadFile(in.CA)', 'wire.AdditionalTransportParametersClient=in.Parameters\n cert,err:=os.ReadFile(in.CA)')
    assert source != original and 'Parameters map' in source
    (workspace/'main.go').write_text(source)
    manifest = wsl('cat', module+'/go.mod').replace('module github.com/quic-go/quic-go',
        'module github.com/quic-go/quic-go/bat-control') + '\nrequire github.com/quic-go/quic-go v0.55.0\n'
    (workspace/'go.mod').write_text(manifest); (workspace/'go.sum').write_text(wsl('cat', module+'/go.sum')+'\n')
    await asyncio.to_thread(wsl, 'go', '-C', linux(workspace), 'mod', 'download', 'github.com/quic-go/quic-go')
    await asyncio.to_thread(wsl, 'env', 'GOFLAGS=-mod=readonly', 'go', '-C', linux(workspace),
                            'build', '-o', output+'/shape-control-client', '.')
    for label, extra in [('wide', {str(2**61+17): base64.b64encode(b'owned').decode()}),
                         ('capacity', {str(100000+i): '' for i in range(129)})]:
        case = online.local('/api/cases', {'kind': 'catalog'}); target = urlsplit(case['url'])
        body = json.dumps({'URL': 'https://'+ip+':4183'+target.path, 'Host': target.hostname+':4183',
            'UA': 'owned-shape-control', 'CA': base+'/tls/cert.pem', 'Parameters': extra})
        result = await asyncio.to_thread(subprocess.run, ['wsl','-d','Ubuntu','--exec',output+'/shape-control-client'],
            input=body.encode(), capture_output=True, timeout=15, check=True, cwd=ROOT)
        await asyncio.sleep(.6)
        observed = [row for row in online.observations(case) if row['category'] == 'quic-shape']
        online.save(out, label+'-quic-shape.json', {'response': json.loads(result.stdout), 'observations': observed})
        assert observed
        if label == 'wide':
            assert all(row['valid'] == 'true' and {'ID': 2**61+17, 'Length': 5} in row['facts']['parameters'] for row in observed)
        else: assert all(row['valid'] == 'false' and row['reason'] == 'quic_shape_capacity' for row in observed)


async def close_case(out, window, browser, profile, capture):
    closed=await window.close(browser); online.save(out,'closed.json',closed)
    assert closed['status']=='confirmed' and not _profile_process_present(profile)
    assert profile.parent==out and out.is_relative_to(BASE/'reports')
    assert not any(p.is_symlink() or p.is_junction() for p in [profile,*profile.rglob('*')])
    if profile.exists(): shutil.rmtree(profile)
    online.save(out,'profile-deleted.json',{'permanentlyDeleted':not profile.exists()})
    if capture:
        code=await asyncio.to_thread(capture.wait,timeout=45)
        online.save(out,'capture-closed.json',{'exitCode':code,'boundedSeconds':40})


async def main():
    out=Path(tempfile.mkdtemp(prefix='h3-integrated-',dir=BASE/'reports')).resolve(); profile=out/'profile'
    os.environ['BAT_ACCESS_STATE_DIR'] = str(out/'access-state')
    print(out,flush=True)
    endpoint=json.loads((BASE/'edge-endpoint.json').read_text())
    ip=endpoint['address']; port=endpoint['port']
    assert ip in wsl('hostname','-I').split() and port==4183
    assert endpoint['scope']=='wsl-private-full-shield'
    assert ipaddress.ip_address(ip).is_private and not ipaddress.ip_address(ip).is_loopback
    unchanged=hashlib.sha256((BASE/'haproxy.cfg').read_bytes()).hexdigest()
    output=linux(out); base=linux(BASE)
    selected=BASE/'runtime/haproxy-h2/haproxy'
    assert hashlib.sha256(selected.read_bytes()).hexdigest()==json.loads((BASE/'edge-h2.json').read_text())['binarySha256']
    window,browser=ManagedWindow(profile,uuid4()),None
    capture=None
    case=online.local('/api/cases',{'kind':'catalog','variant':2})
    url=case['url'].replace('http:','https:').replace(':4187/',':4183/')
    host=urlsplit(url).hostname
    certificate=x509.load_pem_x509_certificate((BASE/'tls/cert.pem').read_bytes())
    pin=base64.b64encode(hashlib.sha256(certificate.public_key().public_bytes(Encoding.DER,PublicFormat.SubjectPublicKeyInfo)).digest()).decode()
    original=subprocess.Popen
    def launch(args,**kwargs):
        if any(arg=='--user-data-dir='+str(profile) for arg in args):
            args=[*args,'--ignore-certificate-errors-spki-list='+pin,'--enable-quic','--no-proxy-server',
                  '--origin-to-force-quic-on='+host+':4183','--host-resolver-rules=MAP '+host+' '+ip]
        return original(args,**kwargs)
    try:
        assert wsl('systemctl','--user','show','bat-antibot-edge.service','--property=WorkingDirectory','--value')==base
        capture=original(['wsl','-d','Ubuntu','-u','root','--exec','tshark','-i','any','-f','udp port 4183',
            '-a','duration:40','-a','filesize:4096','-w',output+'/capture.pcapng'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        with patch('browser_use_runner.managed_window.subprocess.Popen',side_effect=launch):
            browser=await window.start(resume=False,allowed_domains=['*.localhost'])
        lease=window._load()
        online.save(out,'owner.json',{'pid':lease.browserPid,'started':lease.browserStarted,'profile':str(profile),'reusedService':'bat-antibot-edge','listen':ip+':4183','personalTrustChanged':False})
        before={row['id'] for row in online.alerts()}
        page=await browser.get_current_page()
        await online.ready(page,url)
        protocol=await page.evaluate("() => performance.getEntriesByType('navigation')[0].nextHopProtocol")
        await page.evaluate('() => fetch(location.href).then(r=>r.status)')
        await asyncio.sleep(3)
        normal=[row for row in rows(BASE/'logs/tls.jsonl') if row['site']==hashlib.sha256(host.encode()).hexdigest()]
        alerts=[row for row in online.alerts() if row['id'] not in before]
        online.save(out,'normal.json',{'protocol':protocol,'transport':normal,'alertScenarios':[row['scenario'] for row in alerts]})
        assert protocol=='h3' and normal and all(row['transport']=='q' and row['ja4_status']=='measured' for row in normal), 'native_h3_unavailable'
        assert not any(row['scenario'] in ('bat-lab/protocol-continuity', 'bat-lab/h3-continuity', 'bat-lab/quic-continuity') for row in alerts),'normal_h3_false_positive'
        h3 = [row for row in online.observations(case) if row['category'] == 'h3-continuity']
        online.save(out, 'normal-h3-settings.json', h3)
        assert h3 and all(row['valid'] == 'true' for row in h3), 'native_h3_metadata_unavailable'
        quic = [row for row in online.observations(case) if row['category'] == 'quic-continuity']
        online.save(out, 'normal-quic-parameters.json', quic)
        assert quic and all(row['valid'] == 'true' and len(row['facts']) == 12 for row in quic)
        shape_proof(out, case, before, normal=True)
        module=wsl('go','env','GOMODCACHE')+'/github.com/quic-go/quic-go@v0.55.0'
        wsl('env','GOFLAGS=-mod=readonly','go','-C',module,'build','-o',output+'/control-client',linux(ROOT/'apps/api/tests/antibot-m0/quic-control-client.go'))
        session=await browser.get_or_create_cdp_session()
        cookies=await session.cdp_client.send.Network.getCookies(params={'urls':[url]},session_id=session.session_id)
        cookie=next(row['value'] for row in cookies['cookies'] if row['name']=='__crowdsec_challenge')
        ua=await page.evaluate('() => navigator.userAgent')
        body=json.dumps({'URL':'https://'+ip+':4183'+urlsplit(url).path,'Host':urlsplit(url).netloc,
            'UA':ua,'Cookie':'__crowdsec_challenge='+cookie,'CA':base+'/tls/cert.pem'})
        control=await asyncio.to_thread(subprocess.run,['wsl','-d','Ubuntu','--exec',output+'/control-client'],
            input=body.encode(),capture_output=True,timeout=15,check=True,cwd=ROOT)
        result=json.loads(control.stdout)
        assert result['status']==200 and result['protocol']=='HTTP/3.0'
        await asyncio.sleep(3)
        alerts=[row for row in online.alerts() if row['id'] not in before and row['scenario']=='bat-lab/protocol-continuity']
        online.save(out,'mixed.json',{'response':result,'transport':[row for row in rows(BASE/'logs/tls.jsonl') if row['site']==hashlib.sha256(host.encode()).hexdigest()],'alerts':alerts})
        assert alerts,'h3_mixed_network_not_detected'
        h3_alerts = [row for row in online.alerts() if row['id'] not in before and row['scenario'] == 'bat-lab/h3-continuity']
        online.save(out, 'h3-settings-alerts.json', h3_alerts)
        assert h3_alerts, 'h3_settings_mixed_stack_not_detected'
        quic_alerts = [row for row in online.alerts() if row['id'] not in before and row['scenario'] == 'bat-lab/quic-continuity']
        online.save(out, 'quic-parameters-alerts.json', quic_alerts)
        assert quic_alerts, 'quic_parameters_mixed_stack_not_detected'
        shape_proof(out, case, before, normal=False)
        await controlled_parameters(out, ip, base, output)
        alternative=online.local('/api/cases',{'kind':'catalog'})
        target=urlsplit(alternative['url'])
        body=json.dumps({'URL':'https://'+ip+':4183'+target.path,'Host':target.hostname+':4183',
            'UA':'B-A-T-owned-ALPN-control','Cookie':'','CA':base+'/tls/cert.pem','ALPN':['x-lab-9','h3']})
        await asyncio.to_thread(subprocess.run,['wsl','-d','Ubuntu','--exec',output+'/control-client'],
            input=body.encode(),capture_output=True,timeout=15,check=True,cwd=ROOT)
        await asyncio.sleep(.5)
        observed=[row for row in rows(BASE/'logs/tls.jsonl') if row['site']==hashlib.sha256(target.hostname.encode()).hexdigest()]
        online.save(out,'alpn.json',observed)
        assert observed and all(row['ja4_status']=='measured' and row['alpn']=='h3' and row['ja4'].split('_')[0].endswith('x9') for row in observed)
        await settings_controls(out, ip, base, output)
        await shape_controls(out, ip, base, output)
    finally:
        await close_case(out, window, browser, profile, capture)
        assert hashlib.sha256((BASE/'haproxy.cfg').read_bytes()).hexdigest()==unchanged
    independent(out)
    online.save(out,'passed.json',{'nativeWindowsBatH3':True,'nativeFetch':True,'normalNoProtocolAlert':True,
        'mixedGoH3Detected':True,'originalCrowdSecFullShield':True,'nativeFirstAlpnMeasured':True,
        'independentCaptureMatched':True,'quicEffectiveParameters':12,'quicShapeMatched':True,
        'controlledIdleTimeoutMs':17000,'modelCalls':0})

if __name__ == '__main__':
    parameter_boundaries()
    if '--metadata-only' in sys.argv: print(json.dumps({'parameterBoundariesPassed': True, 'browserStarted': False}))
    else: asyncio.run(main())
