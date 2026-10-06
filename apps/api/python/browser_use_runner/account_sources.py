"""Execute pinned upstream functions without importing uploader/crawler products."""
import ast, asyncio, hashlib, json, os, re, types, zipfile
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urljoin, urlencode

from browser_use_runner.account_borrow import CheckPage

ROOT = Path(__file__).resolve().parents[4]
SOURCE = ROOT / 'vendor/account-checks'


class QuietLogger:
    def __getattr__(self, _name):
        # WHY：上游错误常包含完整响应/Cookie；不让它进入产品stdout/日志。
        return lambda *_args, **_kwargs: None


def source_tree(package, filename):
    manifest = json.loads((SOURCE / 'UPSTREAM.json').read_text())['sources'][package]
    archive = SOURCE / f'{package}.zip'
    if hashlib.sha256(archive.read_bytes()).hexdigest() != manifest['archiveSha256']:
        raise ValueError('account_upstream_archive_changed')
    with zipfile.ZipFile(archive) as stream:
        content = stream.read(filename)
    if hashlib.sha256(content).hexdigest() != manifest['files'][filename]:
        raise ValueError('account_upstream_source_changed')
    return ast.parse(content.decode('utf-8-sig')), manifest['commit']


def upstream_function(package, filename, function, supplied=None):
    tree, commit = source_tree(package, filename)
    namespace = {'__builtins__': __builtins__, 'asyncio': asyncio, 'os': os, 're': re,
                 'Path': Path, 'json': json, 'urlencode': urlencode,
                 'utils': SimpleNamespace(logger=QuietLogger()), **(supplied or {})}
    for node in tree.body:
        if isinstance(node, ast.Assign):
            try:
                value = ast.literal_eval(node.value)
            except (ValueError, TypeError):
                # WHY：上游常量会拼接BASE_URL；只允许原AST中的纯字符串/数值表达式，不执行调用或属性访问。
                allowed = (ast.Constant, ast.Name, ast.Load, ast.BinOp, ast.Add, ast.JoinedStr, ast.FormattedValue)
                names = [n.id for n in ast.walk(node.value) if isinstance(n, ast.Name)]
                if any(not isinstance(n, allowed) for n in ast.walk(node.value)) or any(
                    not isinstance(namespace.get(name), (str, int, bool)) for name in names):
                    continue
                value = eval(compile(ast.Expression(node.value), '<upstream-constant>', 'eval'), {'__builtins__':{}}, namespace)
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id not in namespace:
                    namespace[target.id] = value
    node = next((n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
                 and n.name == function), None)
    if node is None:
        raise ValueError('account_upstream_callable_missing')
    helpers = {n.name: n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
    selected, pending = {}, [node]
    while pending:
        current = pending.pop()
        if current.name in selected:
            continue
        current.decorator_list = []
        selected[current.name] = current
        pending.extend(helpers[n.id] for n in ast.walk(current) if isinstance(n, ast.Name)
                       and n.id in helpers and n.id not in namespace and n.id not in selected)
    module = ast.Module(body=[ast.ImportFrom(module='__future__', names=[ast.alias(name='annotations')], level=0),
                            *selected.values()], type_ignores=[])
    ast.fix_missing_locations(module)
    exec(compile(module, f'{package}@{commit}/{filename}', 'exec'), namespace)
    return namespace[function], {'package': package, 'commit': commit, 'file': filename,
                                  'callable': function, 'startLine': node.lineno, 'endLine': node.end_lineno}


class BorrowedContext:
    def __init__(self, borrowed, scope, observations):
        self.borrowed, self.scope = borrowed, scope
        self.page = CheckPage(borrowed, scope['origins'], observations)

    async def new_page(self):
        return self.page

    async def cookies(self, urls=None):
        requested = self.scope['cookieUrls'] if urls is None else urls
        if any(url not in self.scope['cookieUrls'] for url in requested):
            raise ValueError('account_cookie_scope_denied')
        return await self.borrowed.cookies(requested)

    async def add_init_script(self, *_args, **_kwargs):
        raise ValueError('account_context_init_script_forbidden')


class BorrowedBrowser:
    def __init__(self, context):
        self.context = context

    async def launch(self, **_kwargs):
        return self

    async def new_context(self, **_kwargs):
        return self.context

    async def close(self):
        return None


class BorrowedPlaywright:
    def __init__(self, context):
        self.chromium = self.firefox = BorrowedBrowser(context)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False


async def sau_check(filename, borrowed, scope, observations):
    context = BorrowedContext(borrowed, scope, observations)

    async def omit_global_script(value):
        observations['globalInitSuppressed'] = True
        return value

    async def stealth_context(_browser, _file):
        return context

    async def stealth_page(_context):
        return context.page

    supplied = {'async_playwright': lambda: BorrowedPlaywright(context),
        'set_init_script': omit_global_script, '_create_stealth_context': stealth_context,
        '_new_stealth_page': stealth_page, '_resolve_account_file': lambda value: value,
        '_build_launch_kwargs': lambda **_kwargs: {}, '_msg': lambda _emoji, text: text,
        '_build_xhs_creator_url': lambda path: urljoin('https://creator.xiaohongshu.com', path),
        'LOCAL_CHROME_PATH': None, 'LOCAL_CHROME_HEADLESS': True,
        '_invalid_cookie_auth': lambda *_args: False}
    tree, _commit = source_tree('social-auto-upload', filename)
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and node.id.endswith('_logger'):
            supplied[node.id] = QuietLogger()
    function, receipt = upstream_function('social-auto-upload', filename, 'cookie_auth', supplied)
    observations['sources'].append(receipt)
    result = await function(str(SOURCE / 'social-auto-upload.zip'))
    observations['upstreamBoolean'] = bool(result)
    return context


async def mc_check(filename, client, observations, context=None):
    utils = SimpleNamespace(logger=QuietLogger())

    async def cookies(context, urls):
        values = await context.cookies(urls)
        return '', {item['name']: item['value'] for item in values}

    utils.convert_browser_context_cookies = cookies
    function, receipt = upstream_function('mediacrawler', filename, 'pong', {'utils': utils})
    observations['sources'].append(receipt)
    args = (client, context) if 'browser_context' in function.__code__.co_varnames else (client,)
    observations['upstreamBoolean'] = bool(await function(*args))
