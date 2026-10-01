"""Fetch immutable P0 research inputs; does not install or start browser software."""
import hashlib
import argparse
import io
import json
from pathlib import Path
import tarfile
import urllib.request


CANDIDATES = (
    ('playwriter', 'remorses/playwriter',
     '33d5c5a2c5ebf702e387d94d609e038c98e0acec',
     'e57431d8f6e8ef7b386d5a6d04468cba4229e7c54697dd9b3e95134dd2c5cecd',
     ('LICENSE', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
      'playwriter/', 'extension/')),
    ('playwright', 'microsoft/playwright',
     '8b552173e8d767db29b8baef8f4a1f08cf7f26bf',
     '2782d7e7b862200e25c6b0dcaebc8dad9285ba0cd8069aaa8e897c689320446a',
     ('LICENSE', 'package.json', 'package-lock.json', 'packages/extension/',
      'packages/playwright-core/src/tools/mcp/',
      'packages/isomorphic/manualPromise.ts', 'utils/build/', 'tests/extension/')),
    ('panerelay', 'F-loat/panerelay',
     '852dcd8208f58a885187329c185df9167d45c9c3',
     'd71ba8e4757c43e6f4f05333203801828533c5ce089d0d33bc6a5cb9c22796b0',
     ('LICENSE', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
      'packages/protocol/', 'packages/bridge/', 'packages/browser-registry/',
      'packages/adapters/', 'packages/setup/', 'apps/extension/', 'docs/')),
)


def retained(relative, prefixes):
    return any(relative == prefix or
               (prefix.endswith('/') and relative.startswith(prefix)) for prefix in prefixes)


def fetch_candidate(root, candidate, archive_path=None):
    name, repository, commit, expected_digest, prefixes = candidate
    target = root / 'work' / 'daily-chrome-p0' / name
    if archive_path:
        raw = archive_path.read_bytes()
    else:
        request = urllib.request.Request(
            f'https://codeload.github.com/{repository}/tar.gz/{commit}',
            headers={'User-Agent': 'B-A-T-P0-source-check'})
        raw = urllib.request.urlopen(request, timeout=60).read()
    if hashlib.sha256(raw).hexdigest() != expected_digest:
        raise ValueError(f'candidate_archive_digest_mismatch:{name}')
    hashes = {}
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as archive:
        for member in archive.getmembers():
            parts = member.name.split('/', 1)
            if len(parts) != 2 or not member.isfile() or not retained(parts[1], prefixes):
                continue
            relative = Path(parts[1])
            if relative.is_absolute() or any(part in ('..', 'node_modules', '.git')
                                             for part in relative.parts):
                raise ValueError('candidate_archive_path_invalid')
            content = archive.extractfile(member).read()
            output = target / relative
            # WHY：只补研究输入；发现本地候选被改动时停止，不能覆盖已有试验补丁。
            if output.exists() and output.read_bytes() != content:
                raise ValueError(f'candidate_source_changed:{name}:{relative}')
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(content)
            hashes[relative.as_posix()] = hashlib.sha256(content).hexdigest()
    metadata = {'candidate': name, 'repository': repository, 'commit': commit,
                'archiveSha256': expected_digest, 'retainedFiles': len(hashes), 'files': hashes}
    (target / 'SOURCE.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'candidate': name, 'commit': commit, 'verifiedFiles': len(hashes)}))


if __name__ == '__main__':
    checkout = Path.cwd().resolve()
    if Path(__file__).resolve().parent.parent != checkout:
        raise ValueError('run_from_actual_checkout_root')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate', action='append', choices=[entry[0] for entry in CANDIDATES])
    parser.add_argument('--archive-path', type=Path, help='Verify an already downloaded archive for one candidate.')
    arguments = parser.parse_args()
    selected = arguments.candidate
    if arguments.archive_path and (not selected or len(selected) != 1):
        parser.error('--archive-path requires exactly one --candidate')
    for pinned_candidate in CANDIDATES:
        if selected and pinned_candidate[0] not in selected:
            continue
        fetch_candidate(checkout, pinned_candidate, arguments.archive_path)
