"""Reproducible narrow adapter; never overwrites original release or configuration."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tarfile

from lab_paths import ROOT, BASE, linux_command, linux_path, linux_architecture, artifacts
COMMIT = '909b5157986a2b2c2163300fdaef5ed01289f7d2'
ARCHIVE = BASE / 'upstream/crowdsec-source-v1.8.1.tar.gz'
TARGET = BASE / 'runtime/crowdsec-persistent'
SOURCE = TARGET / ('crowdsec-' + COMMIT)


def wsl(*args):
    return subprocess.run(linux_command(*args), check=True, cwd=ROOT)


def linux(path):
    return linux_path(path)


def adapt(name, expected, changes):
    file = SOURCE / 'pkg/appsec/challenge' / name
    text = file.read_text()
    if '// B-A-T persistent spent adapter' in text: return
    assert hashlib.sha256(file.read_bytes()).hexdigest() == expected, 'upstream-source-changed:' + name
    for old, new in changes:
        assert text.count(old) == 1, 'patch-context-changed:' + name
        text = text.replace(old, new)
    file.write_text('// B-A-T persistent spent adapter, original MIT retained.\n' + text, newline='\n')


def main():
    active = subprocess.run(linux_command('systemctl', '--user', 'show', 'bat-antibot-engine.service', '--property=ExecStart', '--value'), capture_output=True, cwd=ROOT)
    if '/runtime/crowdsec-persistent/crowdsec' in active.stdout.decode():
        raise RuntimeError('stop-owned-engine-before-rebuilding-active-binary')
    assert hashlib.sha256(ARCHIVE.read_bytes()).hexdigest() == '6a9219a2a2706e35b723750d581c697db54d32d1b3995216cc2838329e15f7dc'
    if not SOURCE.exists():
        TARGET.mkdir(parents=True, exist_ok=True)
        with tarfile.open(ARCHIVE) as archive: archive.extractall(TARGET, filter='data')
    adapt('spent_set.go', '0fb260701a2590eeedfd7bdc60704d9680c51b979e12df55860325ff6b910790', [
        ('import (', 'import (\n\t"database/sql"'),
        ('cache gcache.Cache', 'cache gcache.Cache\n\tdb *sql.DB'),
        ('\tif s.cache.Has(r) {', '\tif s.db != nil { return s.checkPersistent(r, ttl) }\n\n\tif s.cache.Has(r) {')])
    adapt('challenge.go', 'bce47f4ff9d05eb758066ad8e9423395c0456ccd3ee48bac0c40a0b5c6ca4a69', [
        ('spentSetMaxEntries        int', 'spentSetMaxEntries        int\n\tspentSetPath string'),
        ('\treturn challengeRuntime, nil', '\tif err := challengeRuntime.spent.openPersistent(resolvedOpts.spentSetPath); err != nil {\n\t\t_ = challengeRuntime.Close(ctx)\n\t\treturn nil, err\n\t}\n\treturn challengeRuntime, nil'),
        ('\treturn c.r.Close(ctx)', '\treturn errors.Join(c.spent.closePersistent(), c.r.Close(ctx))')])
    adapt('config.go', '720e3d2b1395b12e143a7be340d82ab317889fc684c73eb7a50122d18fd4d242', [
        ('type Config struct {', 'type Config struct {\n\tSpentSetPath *string `yaml:"spent_set_db"`'),
        ('\tif other.MasterSecret != nil {', '\tif other.SpentSetPath != nil { c.SpentSetPath = other.SpentSetPath }\n\tif other.MasterSecret != nil {'),
        ('\tif c.MasterSecret != nil &&', '\tif c.SpentSetPath != nil { opts = append(opts, WithSpentSetPath(*c.SpentSetPath)) }\n\tif c.MasterSecret != nil &&')])
    folder = SOURCE / 'pkg/appsec/challenge'
    shutil.copyfile(ROOT / 'spent_sqlite.go', folder / 'spent_sqlite.go')
    shutil.copyfile(ROOT / 'tests/challenge_spent_store_test.go', folder / 'spent_sqlite_test.go')
    location = linux(SOURCE)
    wsl('gofmt', '-w', *[linux(folder / name) for name in ['spent_sqlite.go', 'spent_sqlite_test.go', 'spent_set.go', 'challenge.go', 'config.go']])
    wsl('go', '-C', location, 'test', './pkg/appsec/challenge', '-run', 'Test(PersistentSpent|SpentSet|PoWFixture)', '-count=1')
    wsl('go', '-C', location, 'build', '-tags=sqlite_omit_load_extension', '-o', linux(TARGET / 'crowdsec'), './cmd/crowdsec')
    files = ['spent_sqlite.go', 'spent_set.go', 'challenge.go', 'config.go']
    manifest = dict(architecture=linux_architecture(), upstream=COMMIT, sqliteDriver='github.com/mattn/go-sqlite3@v1.14.32',
        files={name: hashlib.sha256((folder / name).read_bytes()).hexdigest() for name in files},
        binarySha256=hashlib.sha256((TARGET / 'crowdsec').read_bytes()).hexdigest(),
        installed=False, originalBinaryUnchanged=True)
    (TARGET / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    print(json.dumps(manifest), flush=True)


if __name__ == '__main__': main()
