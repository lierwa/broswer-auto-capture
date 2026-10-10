"""Public coherence rule controls and existing real B-A-T capture; no new browser."""
import importlib.util
import json
from pathlib import Path
import tempfile

ROOT = Path.cwd().resolve()
spec = importlib.util.spec_from_file_location('h2', ROOT / 'tools/antibot-lab/h2-fingerprint.py')
h2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h2)


def sample(ids, order):
    return dict(Settings=[dict(ID=i, Value=0) for i in ids], PseudoHeaderOrder=order)


def main():
    out = Path(tempfile.mkdtemp(prefix='h2-hints-', dir=h2.BASE / 'reports'))
    binary = h2.prepare()
    inputs = [sample([1, 2, 4, 6], 'm,a,s,p'), sample([1, 2, 4, 5], 'm,p,a,s'),
              sample([1, 4, 6], 'm,p,a,s'), sample([1, 4, 5], 'm,a,s,p'),
              sample([], ''), sample([1, 4], 'm,a,s,p'), sample([1, 4, 6], 'm,s,a,p')]
    controls = h2.classify(binary, inputs)
    assert [row['outcome'] for row in controls] == ['consistent', 'consistent', 'mismatch', 'mismatch', 'unknown', 'unknown', 'unknown']
    old = h2.BASE / 'reports/network-9oi2wxim'
    facts = h2.fingerprints(old / 'network.pcapng', old / 'sslkeys.log')
    actual = h2.classify(binary, list(facts.values()))
    report = dict(upstreamSourceSha256=h2.SHA, controls=controls, syntheticControls=inputs,
                  actual=[dict(stream=key, fields=value, result=result) for (key, value), result in zip(facts.items(), actual)],
                  reusedCapture='network-9oi2wxim', modelCalls=0, newBrowserOpened=False,
                  onlineIngressEnabled=False, scope='component coherence calibration, not whole shield acceptance')
    (out / 'result.json').write_text(json.dumps(report, indent=2))
    assert actual and all(row['outcome'] == 'consistent' for row in actual), 'native-bat-h2-not-consistent'
    print(json.dumps(dict(evidence=str(out), controls=len(controls), nativeConnections=len(actual), allNativeConsistent=True)))


if __name__ == '__main__': main()
