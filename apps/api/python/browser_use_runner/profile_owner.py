"""Persist one profile runner identity; recovery verifies absence without killing a PID."""
import os
import asyncio
from pathlib import Path
from uuid import UUID

import psutil
from pydantic import Field
from workflow_use.hybrid.evidence import Contract
from browser_use_runner.managed_window import ManagedWindow


class ProcessIdentity(Contract):
    pid: int = Field(gt=0)
    started: float = Field(gt=0)
    executable: str = Field(min_length=1)


class RunnerOwnership(ProcessIdentity):
    ownerId: UUID
    temporaryDirectory: str = Field(min_length=1)
    launcher: ProcessIdentity


def current_profile_owner(owner_id, launcher_pid):
    directory = Path(os.environ['TMPDIR']).resolve()
    if not directory.name.startswith('bat-hybrid-owner-'):
        raise ValueError('hybrid_profile_runner_directory_invalid')
    process = psutil.Process(os.getpid())
    # WHY：Windows venv launcher 与实际 Python 控制进程 PID 不同；只接受同进程或直接父进程。
    if process.pid != launcher_pid and process.ppid() != launcher_pid:
        raise ValueError('hybrid_profile_runner_owner_mismatch')
    launcher = psutil.Process(launcher_pid)
    owner = RunnerOwnership(ownerId=owner_id, pid=process.pid, started=process.create_time(),
                            executable=process.exe(), temporaryDirectory=str(directory),
                            launcher=ProcessIdentity(pid=launcher.pid, started=launcher.create_time(), executable=launcher.exe()))
    with (directory / 'runner-owner.json').open('x', encoding='utf-8') as stream:
        stream.write(owner.model_dump_json())
    return owner.model_dump(mode='json')


def verify_profile_runner_closed(owner):
    directory = Path(owner.temporaryDirectory)
    root = Path(os.environ['TMPDIR']).resolve().parent
    if (not directory.is_absolute() or directory.parent.resolve() != root
            or not directory.name.startswith('bat-hybrid-owner-') or directory.resolve() != directory):
        raise ValueError('hybrid_profile_runner_directory_invalid')
    if directory.exists():
        saved = RunnerOwnership.model_validate_json((directory / 'runner-owner.json').read_text(encoding='utf-8'))
        if saved != owner:
            raise ValueError('hybrid_profile_runner_owner_mismatch')
    for identity in (owner, owner.launcher):
        verify_process_absent(identity)


def verify_process_absent(identity):
    try:
        process = psutil.Process(identity.pid)
        # WHY：PID 可复用；只比较原 PID/创建时间/exe，不终止任何进程。
        if abs(process.create_time() - identity.started) <= 0.1:
            if os.path.normcase(process.exe()) != os.path.normcase(identity.executable):
                raise ValueError('hybrid_profile_runner_owner_mismatch')
            raise ValueError('hybrid_profile_runner_active')
    except (psutil.NoSuchProcess, psutil.ZombieProcess):
        return


def recover_profile_owner(profile_path, owner_id, lease_id, owner):
    if owner.ownerId != owner_id or lease_id != owner_id:
        raise ValueError('hybrid_profile_runner_owner_mismatch')
    verify_profile_runner_closed(owner)
    window = ManagedWindow(profile_path, owner_id)
    try:
        lease = window._load(lease_id)
    except ValueError as error:
        if str(error) != 'hybrid_managed_window_lease_missing':
            raise
        return window.inspect(lease_id)
    if lease.creatorPid != owner.pid:
        raise ValueError('hybrid_profile_runner_owner_mismatch')
    # WHY：仅在原控制 runner 身份已核验且退出后，复用既有窗口所有权关闭；不触其他 owner/Profile。
    asyncio.run(window.end_gracefully(lease_id, allow_controlled=True))
    return window.inspect(lease_id)
