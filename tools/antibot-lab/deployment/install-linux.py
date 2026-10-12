"""Install a verified native release using Python tarfile/npm and the existing initializer."""
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tarfile


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def unpack(archive, target):
    with tarfile.open(archive) as stream:
        # Published source archive has regular files only; never install links or path escapes.
        for row in stream.getmembers():
            if not row.isfile() and not row.isdir():
                raise RuntimeError('source_archive_link_or_special_file')
            if not (target / row.name).resolve().is_relative_to(target.resolve()):
                raise RuntimeError('source_archive_path_escape')
        stream.extractall(target, filter='data')


def install(package, destination):
    if sys.platform != 'linux' or len(sys.argv) != 2:
        raise RuntimeError('usage: python3 install-linux.py <absolute-new-install-directory>')
    arch = {'x86_64': 'x64', 'aarch64': 'arm64'}.get(platform.machine())
    receipt = json.loads((package / 'runtime-release.json').read_text())
    if receipt['architecture'] != arch or receipt['distribution'] != 'ubuntu-26.04':
        raise RuntimeError('runtime_architecture_mismatch')
    for name, expected in receipt['files'].items():
        file = package / name
        if file.is_symlink() or not file.resolve().is_relative_to(package) or digest(file) != expected:
            raise RuntimeError('release_file_changed:' + name)
    if not destination.is_absolute() or destination.is_symlink():
        raise RuntimeError('install_absolute_owned_directory_required')
    stamp = destination / 'install-owner.json'
    release_hash = digest(package / 'runtime-release.json')
    if destination.exists():
        owner = json.loads(stamp.read_text())
        if owner != dict(releaseSha256=release_hash, destination=str(destination)):
            raise RuntimeError('install_owner_changed')
        if (destination / 'installed.json').exists():
            for relative in receipt['executables']:
                target = destination / 'data' / relative
                if target.is_symlink() or not target.resolve().is_relative_to(destination / 'data') or digest(target) != receipt['files']['assets/' + relative]:
                    raise RuntimeError('installed_runtime_changed:' + relative)
            print(json.dumps(dict(alreadyInstalled=True, destination=str(destination))))
            return
    else:
        destination.mkdir(parents=True)
        stamp.write_text(json.dumps(dict(releaseSha256=release_hash, destination=str(destination))))
    program, data = destination / 'program', destination / 'data'
    program.mkdir(exist_ok=True)
    data.mkdir(exist_ok=True)
    unpack(package / 'shield-source.tgz', program)
    for name in receipt['files']:
        if not name.startswith('assets/'):
            continue
        relative = name.removeprefix('assets/')
        target = data / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.is_symlink() or not target.resolve().is_relative_to(data):
            raise RuntimeError('install_asset_link')
        shutil.copyfile(package / name, target)
        if relative in receipt['executables']:
            target.chmod(0o755)
    shutil.copyfile(package / 'runtime-release.json', data / 'runtime-release.json')
    shutil.copyfile(package / 'shield.sh', destination / 'shield.sh')
    (destination / 'shield.sh').chmod(0o755)
    # Official Node distribution provides npm; Python comes from the same Ubuntu runtime package.
    with tarfile.open(data / 'upstream/node.tar.xz') as stream:
        stream.extractall(data / 'runtime/node', filter='data')
    node_root = data / f'runtime/node/node-v24.9.0-linux-{arch}'
    environment = {**os.environ, 'BAT_ANTIBOT_DATA': str(data), 'PATH': str(node_root / 'bin') + os.pathsep + os.environ['PATH']}
    if subprocess.run(['ip', 'link', 'show', 'shieldvz'], capture_output=True).returncode == 0:
        environment['BAT_SHIELD_PRIVATE_INTERFACE'] = 'shieldvz'
    subprocess.run([str(node_root / 'bin/node'), str(node_root / 'lib/node_modules/npm/bin/npm-cli.js'),
                    'ci', '--omit=dev', '--ignore-scripts', '--workspaces=false', '--no-audit', '--no-fund'],
                   cwd=program, env=environment, check=True)
    subprocess.run([str(node_root / 'bin/node'), str(program / 'lab.ts'), 'initialize'],
                   cwd=program, env=environment, check=True)
    (destination / 'installed.json').write_text(json.dumps(dict(releaseSha256=release_hash, architecture=arch)))
    print(json.dumps(dict(installed=True, started=False, destination=str(destination))))


if __name__ == '__main__':
    install(Path(__file__).resolve().parent, Path(sys.argv[1]) if len(sys.argv) == 2 else Path('.'))
