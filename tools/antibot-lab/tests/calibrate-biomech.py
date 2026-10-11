"""Diagnostic transfer check of pinned upstream motion features, never a blocker."""
import dataclasses
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys
import tempfile

import subprocess
BASE = Path(json.loads(subprocess.check_output(['node', str(Path(__file__).resolve().parents[1] / 'locations.mjs')], text=True))['directory'])
UPSTREAM = BASE / 'upstream/candidate-review/kitsune'
SOURCE = UPSTREAM / 'harness_src_kitsune_harness_biomech.py'
SHA256 = 'b005a549224d803b927948a7889f83fce696ad9fe281758b452ea7fbf1e537bd'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == SHA256
spec = importlib.util.spec_from_file_location('upstream_biomech', SOURCE)
biomech = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = biomech
spec.loader.exec_module(biomech)
registry = (UPSTREAM / 'contracts_rules_registry.yaml').read_text()
rule = registry.split('- id: bh.power_law_violation\n', 1)[1].split('\n  - id:', 1)[0]
assert 'threshold: 0.05\n' in rule and 'status: experimental\n' in rule
THRESHOLD = 0.05  # 上游固定阈值；不因本机/公开样本结果重新拟合。


def evaluate(record, label, points):
    points = [tuple(p[:3]) for p in points]
    invalid = any(len(p) != 3 or not all(math.isfinite(x) for x in p) for p in points)
    non_increasing = sum(b[2] <= a[2] for a, b in zip(points, points[1:]))
    if invalid or non_increasing:
        return dict(record=record, label=label, samples=len(points), status='invalid',
                    nonIncreasingTimestamps=non_increasing, flagged=None)
    features = dataclasses.asdict(biomech.extract(points))
    beta = features['power_law_exponent']
    return dict(record=record, label=label, samples=len(points),
                status='measured' if beta is not None else 'unavailable',
                flagged=beta < THRESHOLD if beta is not None else None, features=features)


def controls():
    # 测量契约校准：不同曲率、恒定步速的合成轨迹，不冒充真人样本。
    coords = [(i, i * i / 50) for i in range(100)]
    distance = 0.0
    points = []
    for i, point in enumerate(coords):
        if i:
            distance += math.dist(coords[i - 1], point)
        points.append((*point, distance))
    positive = evaluate('constant-speed-curved', 'synthetic-control', points)
    straight = evaluate('straight', 'synthetic-control', [(i, i, i) for i in range(50)])
    empty = evaluate('empty', 'synthetic-control', [])
    invalid = evaluate('invalid-clock', 'synthetic-control', [(0, 0, 2), (1, 2, 1)])
    assert positive['flagged'] is True
    assert straight['status'] == empty['status'] == 'unavailable'
    assert invalid['status'] == 'invalid'
    return [positive, straight, empty, invalid]


def main():
    out = Path(tempfile.mkdtemp(prefix='biomech-', dir=BASE / 'reports'))
    input_path = BASE / 'reports/motion-phase2-labelled-input.jsonl'
    items = [json.loads(line) for line in input_path.read_text().splitlines()]
    rows = [evaluate(item['record'], item['label'], item['points']) for item in items]
    owner = BASE / 'reports/human-17e48fb750af4fd0b5a18d3420640920'
    for phase in range(3):
        data = json.loads((owner / f'phase-{phase}.json').read_text())
        rows.append(evaluate(f'local-phase-{phase}', 'one-local-person', data['data']['m']))
    counts = {}
    for row in rows:
        count = counts.setdefault(row['label'], dict(records=0, measured=0, invalid=0,
                                                     unavailable=0, flagged=0, notFlagged=0))
        count['records'] += 1
        count[row['status']] += 1
        if row['flagged'] is not None:
            count['flagged' if row['flagged'] else 'notFlagged'] += 1
    report = dict(component='datascry/kitsune', commit='f0a22b3600a829f7de9d6abb48ff1aaebfb5a69e',
                  sourceSha256=SHA256, originalThreshold=THRESHOLD, counts=counts, rows=rows,
                  controls=controls(), inputSha256=hashlib.sha256(input_path.read_bytes()).hexdigest(),
                  acceptedForBlocking=False, trainedOrTuned=False,
                  scope='Transfer diagnostic, not independent-user classifier acceptance',
                  limits=['Existing public data lacks user/device identities; last 500 points per record',
                          'Existing local sample is one person in three free-operation phases',
                          'Invalid clocks are excluded, never sorted or repaired to make a score',
                          'Upstream rule is experimental and corroborating only',
                          'Not flagged does not mean human; no B-A-T trajectory humanization inferred',
                          'Public data CC BY-NC-SA retained for local research, not redistributed'])
    (out / 'result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(dict(out=str(out), counts=counts, acceptedForBlocking=False)))


if __name__ == '__main__':
    main()
