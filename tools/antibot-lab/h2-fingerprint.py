"""Original tshark protocol parsing and pinned upstream hints; no header values exported."""
import hashlib
import json
from pathlib import Path
import subprocess

from lab_paths import ROOT, BASE, linux_command, linux_path, linux_architecture, artifacts
UPSTREAM = BASE / 'upstream/candidate-review/kitsune/edge_internal_fingerprint_h2.go'
SHA = '90969540ab6663ecaed1f92403a0d7941636c976f42b994be3847c3135c1dffa'


def run(*args, data=None):
    result = subprocess.run(linux_command(*args), input=data,
                            capture_output=True, check=True, cwd=ROOT)
    return result.stdout


def linux(path):
    return linux_path(path)


def prepare():
    assert hashlib.sha256(UPSTREAM.read_bytes()).hexdigest() == SHA
    # WHY：离线校准不能覆盖正在提供在线检测的分类器及其启动摘要。
    target = BASE / 'runtime/h2-hints-offline'
    target.mkdir(exist_ok=True)
    # WHY：仅Go命名空间适配；原所有算法/值表不修改，摘要分别留存。
    original = UPSTREAM.read_text()
    assert original.count('package fingerprint') == 1
    (target / 'h2.go').write_text(original.replace('package fingerprint', 'package main'), newline='\n')
    (target / 'main.go').write_bytes((ROOT / 'h2-fingerprint.go').read_bytes())
    run('go', 'build', '-o', linux(target / 'h2-hints'), linux(target / 'h2.go'), linux(target / 'main.go'))
    return target / 'h2-hints'


def classify(binary, rows):
    return json.loads(run(linux(binary), data=json.dumps(rows).encode()))


def values(value):
    return value if isinstance(value, list) else [value] if value is not None else []


def packets(pcap, keys, port):
    # raw PCAP/密钥限本项目owned报告；输出只保留协议元信息，不保存解密页面/头值。
    for file in [pcap, keys]:
        assert file.resolve().is_relative_to(BASE / 'reports') and file.is_file()
    return json.loads(run('tshark', '-r', linux(pcap), '-o', 'tls.keylog_file:' + linux(keys),
        '-Y', f'http2 && tcp.dstport=={port}', '-T', 'json', '--no-duplicate-keys', '-J', 'tcp http2'))


def fingerprints(pcap, keys, port=4185):
    connections = {}
    pseudo = {':method': 'm', ':authority': 'a', ':scheme': 's', ':path': 'p'}
    for packet in packets(pcap, keys, port):
        layers = packet['_source']['layers']
        stream = layers['tcp']['tcp.stream']
        item = connections.setdefault(stream, dict(Settings=[], PseudoHeaderOrder='', WindowUpdate=0))
        for value in values(layers.get('http2')):
            frame = value['http2.stream']
            if frame.get('http2.type') == '4' and not item['Settings']:
                for setting in values(frame.get('http2.settings')):
                    found = [v for k, v in setting.items() if k != 'http2.settings.id']
                    if len(found) != 1: raise ValueError('h2_setting_value_unavailable')
                    item['Settings'].append(dict(ID=int(setting['http2.settings.id']), Value=int(found[0])))
            if frame.get('http2.type') == '8' and frame.get('http2.streamid') == '0' and not item['WindowUpdate']:
                item['WindowUpdate'] = int(frame['http2.window_update.window_size_increment'])
            if frame.get('http2.type') == '1' and not item['PseudoHeaderOrder']:
                names = [h['http2.header.name'] for h in values(frame.get('http2.header'))]
                item['PseudoHeaderOrder'] = ','.join(pseudo[n] for n in names if n in pseudo)
    return connections
