"""Run-owned context for the pinned Tools/FileSystem public API, never a file executor."""
import hashlib
import mimetypes
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import UUID

from browser_use.filesystem.file_system import FileSystem

FILE_ACTIONS = frozenset({'read_file', 'write_file', 'replace_file', 'upload_file', 'save_as_pdf', 'screenshot'})
FILE_RESULT_ACTIONS = FILE_ACTIONS - {'upload_file'}
FILE_OUTPUT_SCHEMA = {'type': 'object', 'properties': {
    'text': {'type': 'string'}, 'files': {'type': 'array', 'items': {'type': 'object', 'properties': {
        'artifactId': {'type': 'string'}, 'mediaType': {'type': 'string'}, 'digest': {'type': 'string'}},
        'required': ['artifactId', 'mediaType', 'digest'], 'additionalProperties': False}}},
    'required': ['text', 'files'], 'additionalProperties': False}
FILE_LIMIT = 64 * 1024 * 1024


def native_filename(value):
    # WHY：原生 get_file 按 basename 匹配且会自动改名；拒绝路径/改名，不能把越界输入映射为同名产物。
    if (not isinstance(value, str) or not value or value in {'.', '..'} or '/' in value or '\\' in value
            or FileSystem.sanitize_filename(value) != value):
        raise ValueError('native_file_name_invalid')
    return value


def check_native_file_arguments(name, args, file_system, available_file_paths=()):
    if name not in FILE_ACTIONS:
        return
    if file_system is None:
        raise ValueError('native_file_context_required')
    key = 'path' if name == 'upload_file' else 'file_name'
    value = args.get(key)
    if value is None and name in {'save_as_pdf', 'screenshot'}:
        return
    if name in {'read_file', 'upload_file'} and value in available_file_paths:
        resolved = Path(value).resolve(strict=True)
        if not resolved.is_file() or str(resolved) != value:
            raise ValueError('native_authorized_file_identity_mismatch')
        return
    basename = native_filename(value)
    if name in {'write_file', 'replace_file'} and Path(basename).suffix.lower() in {'.pdf', '.docx'}:
        # WHY：原生转换器可能用文字承载部分写入失败；当前只有文本字节能独立核实，不把hash变化当成功。
        raise ValueError('native_binary_file_write_unverified')
    if name in {'read_file', 'replace_file', 'upload_file'}:
        item = file_system.get_file(basename)
        if item is None or item.full_name != basename:
            raise ValueError('native_file_missing')
        checked_file(file_system.get_dir() / basename, file_system.get_dir())
    if name == 'replace_file' and not args.get('old_str'):
        raise ValueError('native_file_replace_empty')


def checked_file(file, directory):
    file, directory = Path(file).absolute(), Path(directory).absolute()
    resolved = file.resolve(strict=True)
    root = directory.resolve(strict=True)
    base = directory if file.is_relative_to(directory) else root
    canonical = root / file.relative_to(base) if file.is_relative_to(base) else None
    if canonical is None or resolved != canonical or not resolved.is_file():
        raise ValueError('native_file_owner_mismatch')
    if not 0 <= resolved.stat().st_size <= FILE_LIMIT:
        raise ValueError('native_file_size_limit')
    return resolved


def native_file_identity(file, file_system):
    from .evidence import digest
    file = checked_file(file, file_system.get_dir())
    content = file.read_bytes()
    return {'fileName': file.name, 'pathDigest': digest(str(file)),
            'contentDigest': hashlib.sha256(content).hexdigest(), 'byteLength': len(content)}


class NativeFileContext:
    def __init__(self, directory, owner_id, *, available_file_paths=()):
        self.owner_id = str(UUID(str(owner_id)))
        parent = Path(directory).resolve() / 'native-files' / self.owner_id
        for candidate in (parent.parent, parent):
            if candidate.is_symlink() or candidate.exists() and candidate.resolve() != candidate:
                raise ValueError('native_file_owner_mismatch')
        parent.mkdir(parents=True, exist_ok=True)
        # WHY：FileSystem 构造会清空其 data_dir；只在全新本owner目录构造，绝不加载/覆盖旧写入。
        self.temporary = TemporaryDirectory(prefix='run-', dir=parent)
        self.root, self.parent = Path(self.temporary.name), parent
        self.file_system = FileSystem(self.root, create_default_files=False)
        self.available_file_paths = list(available_file_paths)
        self.expected_content = None

    def prepare(self, name, args):
        args = dict(args)
        if name in {'read_file', 'upload_file'}:
            key = 'file_name' if name == 'read_file' else 'path'
            value = args.get(key)
            matching = [file for file in self.available_file_paths if Path(file).name == value]
            if isinstance(value, str) and value not in self.available_file_paths and len(matching) == 1:
                native_filename(value)
                args[key] = matching[0]
        check_native_file_arguments(name, args, self.file_system, self.available_file_paths)
        if name == 'upload_file':
            value = args['path']
            file = (Path(value) if value in self.available_file_paths else
                    checked_file(self.file_system.get_dir() / value, self.file_system.get_dir()))
            if file.stat().st_size == 0:
                raise ValueError('native_file_empty')
            args['path'] = str(file)
            if args['path'] not in self.available_file_paths:
                self.available_file_paths.append(args['path'])
        self.expected_content = expected_native_file_content(name, args, self.file_system)
        return args

    def result(self, name, args, result):
        if name not in FILE_RESULT_ACTIONS:
            return result.model_dump(mode='json')
        if name in {'write_file', 'replace_file'}:
            verify_native_file_write(args, self.file_system, self.expected_content)
        return {'text': result.extracted_content or '', 'files': [self.receipt(file, self.file_system)
                for file in result.attachments or []]}

    def receipt(self, file, file_system):
        original = checked_file(file, file_system.get_dir())
        size = original.stat().st_size
        if not 0 < size <= FILE_LIMIT:
            raise ValueError('native_file_size_limit')
        content = original.read_bytes()
        checksum = hashlib.sha256(content).hexdigest()
        if file_system is self.file_system and str(original) not in self.available_file_paths:
            self.available_file_paths.append(str(original))
        # Agent 的临时FileSystem会在done后退出；只复制已核本owner附件字节，不能复用探索文件为新运行输入。
        destination = self.root / 'receipts' / (checksum + original.suffix.lower())
        destination.parent.mkdir(exist_ok=True)
        destination.write_bytes(content)
        return {'format': 'bat-native-file-ref/v1', 'ownerId': self.owner_id, 'fileName': original.name,
                'mediaType': mimetypes.guess_type(original.name)[0] or 'application/octet-stream',
                'digest': checksum, 'byteLength': len(content),
                'relativePath': destination.relative_to(self.parent).as_posix()}

    def close(self):
        self.temporary.cleanup()


def native_file_fact(action_ref, name, result, context, file_system):
    if name not in FILE_RESULT_ACTIONS or result.error is not None:
        return None
    files = [context.receipt(file, file_system) for file in result.attachments or []]
    from .evidence import digest
    return {'schemaVersion': 'bat.native-file-output/v1', 'actionRef': action_ref,
            'resultDigest': digest(result.model_dump(mode='json')), 'text': result.extracted_content or '',
            'files': files}


def expected_native_file_content(name, args, file_system):
    if name not in {'write_file', 'replace_file'}:
        return None
    item = file_system.get_file(args['file_name'])
    previous = item.read() if item is not None else ''
    if name == 'replace_file':
        if args['old_str'] not in previous:
            raise ValueError('native_file_replace_text_missing')
        return previous, previous.replace(args['old_str'], args['new_str']), False
    content = args['content']
    if args.get('trailing_newline', True):
        content += '\n'
    if args.get('leading_newline', False):
        content = '\n' + content
    return previous, content, args.get('append', False)


def verify_native_file_write(args, file_system, before):
    filename = native_filename(args['file_name'])
    item = file_system.get_file(filename)
    if item is None or item.full_name != filename or before is None:
        raise ValueError('native_file_write_unconfirmed')
    file = checked_file(file_system.get_dir() / filename, file_system.get_dir())
    previous, content, append = before
    expected = deepcopy(item)
    expected.update_content(previous)
    if append:
        expected.append_file_content(content)
    else:
        expected.write_file_content(content)
    # WHY：复用原生格式化（如CSV），同时核真实字节；旧文件存在不能证明append/replace成功。
    if item.read() != expected.read() or file.read_bytes() != expected.read().encode('utf-8'):
        raise ValueError('native_file_write_unconfirmed')


def prepare_native_file_capture(collector, name, args):
    collector.native_file_pre_gap, collector.native_file_write_before = None, None
    collector.native_file_input = None
    try:
        available = getattr(collector, 'native_available_file_paths', lambda: [])()
        check_native_file_arguments(name, args, collector.native_file_system, available)
        if name == 'upload_file':
            if not collector.browser.is_local and args['path'] not in available:
                # WHY：CDP attached的原生工具不映射basename；来源参数不暗改，必须由Agent选公开绝对路径。
                raise ValueError('native_upload_absolute_path_required')
            file = (Path(args['path']) if args['path'] in available else
                    checked_file(collector.native_file_system.get_dir() / args['path'], collector.native_file_system.get_dir()))
            if file.stat().st_size == 0:
                raise ValueError('native_file_empty')
        if name in {'read_file', 'upload_file'}:
            value = args['path' if name == 'upload_file' else 'file_name']
            file = Path(value) if value in available else collector.native_file_system.get_dir() / value
            if file.resolve().is_relative_to(collector.native_file_system.get_dir().resolve()):
                collector.native_file_input = native_file_identity(file, collector.native_file_system)
        collector.native_file_write_before = expected_native_file_content(name, args, collector.native_file_system)
    except ValueError as error:
        if str(error) not in {'native_file_missing', 'native_file_replace_text_missing'}:
            raise
        # WHY：缺文件/替换文本属于原生可反馈的业务状态；保留回执与编译缺口，不抢先停止Agent。
        collector.native_file_pre_gap = str(error)


async def capture_native_tool_facts(collector, result):
    name = next(iter(collector.pending['action']))
    facts, reference = [], collector.pending['actionId']
    if name in FILE_ACTIONS:
        context = getattr(collector.browser, '_bat_native_file_context', None)
        if context is None:
            raise ValueError('native_file_context_required')
        if getattr(collector, 'native_file_pre_gap', None):
            from .evidence import gap
            collector.source_gaps.append(gap('missing_effect_proof', [reference], collector.native_file_pre_gap))
            return facts
        if name in {'write_file', 'replace_file'} and result.error is None:
            try:
                verify_native_file_write(collector.pending['action'][name], collector.native_file_system,
                    collector.native_file_write_before)
            except ValueError:
                from .evidence import gap
                collector.source_gaps.append(gap('missing_effect_proof', [reference], 'native_file_write_unconfirmed'))
                return facts
            available = getattr(collector, 'native_available_file_paths', lambda: [])()
            file = checked_file(collector.native_file_system.get_dir() / collector.pending['action'][name]['file_name'],
                                collector.native_file_system.get_dir())
            if str(file) not in available:
                # 原生Agent下一状态和Tools.act都消费当前公开list；下载更新可能换list，故每次取当前实例。
                available.append(str(file))
        value = native_file_fact(reference, name, result, context, collector.native_file_system)
        if value is not None:
            if name in {'write_file', 'replace_file'}:
                value['ownedFile'] = native_file_identity(file, collector.native_file_system)
            facts.append(collector.value_fact('native_file_output', value))
    if name == 'find_text':
        from .natural_effects import read_text_in_view
        text = collector.pending['action']['find_text']['text']
        facts.append(collector.value_fact('find_text_visible', {'actionRef': reference, 'text': text,
            'visible': await read_text_in_view(await collector.browser.get_current_page(), text)}))
    return facts
