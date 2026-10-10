"""Browser-owned temporary files survive the shorter-lived Runner process."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile


def _root():
    path = Path(os.environ.get('BAT_BROWSER_TEMP_ROOT') or tempfile.gettempdir())
    if not path.is_absolute():
        raise ValueError('hybrid_browser_temp_root_invalid')
    return path.resolve(strict=True)


def _identity(profile):
    return {'version': 1, 'profile': hashlib.sha256(os.path.normcase(str(Path(profile).resolve())).encode()).hexdigest()}


def create_browser_temp(window, lease):
    # WHY：深Profile下的TEMP会使Chrome组件解压失败；标准库创建短目录，原租约继续承担所有权。
    path = Path(tempfile.mkdtemp(prefix='bat-chrome-', dir=_root())).resolve()
    marker = path/'.bat-owner.json'
    try:
        marker.write_text(json.dumps(_identity(lease.profilePath)), encoding='utf-8')
        lease.browserTempPath = str(path)
        window._save(lease)
    except BaseException:
        marker.unlink(missing_ok=True)
        path.rmdir()  # 此时尚未启动Chrome，只删除本次刚创建的空目录。
        raise
    return path


def cleanup_browser_temp(lease):
    # 调用方已核验浏览器/子进程退出；handoff和仍存活的共享专属进程不得进入此分支。
    if not lease.browserTempPath:
        return
    path = Path(lease.browserTempPath)
    if (not path.is_absolute() or path.parent != _root() or not path.name.startswith('bat-chrome-')
            or path.is_symlink() or path.is_junction() or path.resolve() != path):
        raise ValueError('hybrid_browser_temp_owner_invalid')
    if not path.exists():
        return  # 上次删除成功但租约尚未落盘，允许原收尾重试。
    marker = path/'.bat-owner.json'
    if marker.is_symlink() or marker.is_junction() or json.loads(marker.read_text(encoding='utf-8')) != _identity(lease.profilePath):
        raise ValueError('hybrid_browser_temp_owner_invalid')
    for parent, directories, files in os.walk(path, followlinks=False):
        if any(item.is_symlink() or item.is_junction() for item in (Path(parent)/name for name in directories + files)):
            raise ValueError('hybrid_browser_temp_link_refused')
    shutil.rmtree(path)
