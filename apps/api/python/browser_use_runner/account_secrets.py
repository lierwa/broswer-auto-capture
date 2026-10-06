"""Current-user Windows DPAPI, with native ACLs, for target rollback only."""
import ctypes, csv, io, json, os, subprocess, sys
from ctypes import wintypes
from pathlib import Path
from uuid import UUID


class Blob(ctypes.Structure):
    _fields_ = [('size', wintypes.DWORD), ('data', ctypes.POINTER(ctypes.c_ubyte))]


def dpapi(data, decrypt=False):
    if sys.platform != 'win32':
        raise ValueError('account_secure_storage_platform_unavailable')
    buffer = (ctypes.c_ubyte * len(data)).from_buffer_copy(data)
    source, output = Blob(len(data), buffer), Blob()
    crypt = ctypes.windll.crypt32
    function = crypt.CryptUnprotectData if decrypt else crypt.CryptProtectData
    function.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p,
                        ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
    function.restype = wintypes.BOOL
    if not function(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(output)):
        raise ValueError('account_secure_storage_unavailable')
    try:
        return ctypes.string_at(output.data, output.size)
    finally:
        ctypes.windll.kernel32.LocalFree.argtypes = [ctypes.c_void_p]
        ctypes.windll.kernel32.LocalFree(ctypes.cast(output.data, ctypes.c_void_p))


def private_acl(path):
    options = {'stdout': subprocess.PIPE, 'stderr': subprocess.DEVNULL,
               'creationflags': subprocess.CREATE_NO_WINDOW, 'check': True, 'timeout': 10}
    user = subprocess.run(['whoami', '/user', '/fo', 'csv', '/nh'], **options).stdout.decode()
    sid = next(csv.reader(io.StringIO(user.strip())))[1]
    if not sid.startswith('S-1-'):
        raise ValueError('account_secure_storage_owner_unknown')
    subprocess.run(['icacls', str(path), '/inheritance:r', '/grant:r', f'*{sid}:(F)'], **options)


class RollbackStore:
    def __init__(self, directory):
        self.directory = Path(directory).resolve() / 'account-rollback'

    def path(self, reference):
        return self.directory / f'{UUID(str(reference))}.dpapi'

    def save(self, reference, snapshot):
        self.directory.mkdir(parents=True, exist_ok=True)
        private_acl(self.directory)
        target = self.path(reference)
        temporary = target.with_suffix('.tmp')
        try:
            temporary.write_bytes(dpapi(json.dumps(snapshot, sort_keys=True).encode()))
            private_acl(temporary)
            os.replace(temporary, target)
        finally:
            temporary.unlink(missing_ok=True)

    def load(self, reference):
        try:
            return json.loads(dpapi(self.path(reference).read_bytes(), decrypt=True))
        except FileNotFoundError:
            raise
        except Exception:
            raise ValueError('account_rollback_snapshot_unavailable') from None

    def remove(self, reference):
        self.path(reference).unlink(missing_ok=True)
