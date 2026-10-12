"""Private owner receipts; reuse never discards an earlier window's ownership."""
import json
import os
from pathlib import Path
from uuid import UUID
from uuid import uuid4
import psutil


def record_target_creation(window, pending):
    # WHY：请求发出但创建回执丢失时沿原租约保留未确认状态，不能伪报清理完成。
    lease = window._load(window.owner_id)
    lease.targetCreationPending = pending
    window._save(lease)


def previous_boot(path):
    """OS boot is stronger evidence than a disconnected extension endpoint."""
    return Path(path).stat().st_mtime < psutil.boot_time()


def browser_exited(path):
    if previous_boot(path):
        return True
    # WHY：断开扩展不能证明关窗；OS 确认没有 Chrome 进程时才结束本机旧收据。
    try:
        return not any((proc.info['name'] or '').lower() in ('chrome.exe', 'chrome', 'google chrome', 'chromium', 'chromium.exe')
                       for proc in psutil.process_iter(['name']))
    except (psutil.AccessDenied, psutil.NoSuchProcess):
        return False


def archived_path(base, owner_id):
    return Path(base).parent / 'window-leases' / Path(base).stem / f'{UUID(str(owner_id))}.json'


def owner_path(base, owner_id):
    base = Path(base)
    if base.exists() and json.loads(base.read_text(encoding='utf-8')).get('ownerId') == str(owner_id):
        return base
    archive = archived_path(base, owner_id)
    return archive if archive.exists() else base


def archive_lease(base, lease, *, release_current=True):
    """Publish a complete exclusive archive before releasing/replacing current."""
    base = Path(base)
    destination = archived_path(base, lease.ownerId)
    destination.parent.mkdir(parents=True, exist_ok=True)
    contents = lease.model_dump_json()
    current = base.read_text(encoding='utf-8')
    # WHY：旧收据缺少新增默认字段仍是同一 owner；按既有 Pydantic 合同比较，
    # 不让默认值规范化被误判为外部修改。后续原文件字节复核仍防止并发变化。
    if type(lease).model_validate_json(current) != lease:
        raise ValueError('hybrid_managed_window_lease_changed')
    temporary = destination.with_name(f'{destination.name}.{uuid4()}.tmp')
    try:
        with temporary.open('x', encoding='utf-8') as stream:
            stream.write(contents)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, 0o600)
        try:
            os.link(temporary, destination)
        except FileExistsError:
            if type(lease).model_validate_json(destination.read_text(encoding='utf-8')) != lease:
                raise ValueError('hybrid_managed_window_archive_changed')
    finally:
        temporary.unlink(missing_ok=True)
    # WHY：单控制器下仍复核原文件，防止重启/外部写入改变 owner；不同历史收据永不覆盖。
    if base.read_text(encoding='utf-8') != current:
        raise ValueError('hybrid_managed_window_lease_changed')
    if release_current:
        base.unlink()
