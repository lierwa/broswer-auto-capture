"""Runtime maintenance must use the packaged checker and reject changed artifacts."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch


class GeoValidatorTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='bat-geo-validator-test-')
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name).resolve()
        self.executable = self.base/'runtime/geoip-validator/geoip-validator'
        self.executable.parent.mkdir(parents=True)
        self.executable.write_bytes(b'checker-fixture')
        (self.base/'tests').mkdir()
        (self.base/'tests/geoip-calibration.go').write_bytes(b'source-fixture')
        digest = lambda b: hashlib.sha256(b).hexdigest()
        self.receipt = dict(binarySha256=digest(b'checker-fixture'), sourceSha256=digest(b'source-fixture'))
        (self.base/'geoip-validator.json').write_text(json.dumps(self.receipt))
        self.release = dict(files={'assets/runtime/geoip-validator/geoip-validator': self.receipt['binarySha256']})
        (self.base/'runtime-release.json').write_text(json.dumps(self.release))
        dependency = types.ModuleType('lab_paths')
        dependency.ROOT = dependency.BASE = self.base
        dependency.linux_path = str
        dependency.linux_command = lambda *args: list(args)
        dependency.linux_architecture = lambda: 'amd64'
        dependency.artifacts = lambda: []
        spec = importlib.util.spec_from_file_location('geo_under_test', Path(__file__).resolve().parents[1]/'prepare-geodata.py')
        self.module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {'lab_paths': dependency}): spec.loader.exec_module(self.module)

    def test_runtime_uses_native_checker_without_go(self):
        self.assertEqual(self.module.validator_command('/candidate'),
                         [str(self.executable), '/candidate', '/candidate/current.json', '--current'])

    def test_changed_binary_is_rejected_before_execution(self):
        self.executable.write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'geo_validator_changed'): self.module.validator_command('/candidate')

    def test_changed_source_is_rejected(self):
        (self.base/'tests/geoip-calibration.go').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'geo_validator_source_changed'): self.module.validator_command('/candidate')

    def test_receipt_cannot_override_release_hash(self):
        self.release['files']['assets/runtime/geoip-validator/geoip-validator'] = '0'*64
        (self.base/'runtime-release.json').write_text(json.dumps(self.release))
        with self.assertRaisesRegex(ValueError, 'geo_validator_release_changed'): self.module.validator_command('/candidate')


if __name__ == '__main__': unittest.main()
