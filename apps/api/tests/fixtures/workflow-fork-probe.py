"""Historical baseline probe. Current fork regressions live in workflows/tests/test_executor_contract.py."""
import argparse
import ast
import asyncio
import contextlib
import io
import json
import logging
import hashlib
import tarfile
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[4] / 'vendor/workflow-use/workflows/workflow_use'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--baseline-archive', type=Path, required=True)
archive_path = parser.parse_args().baseline_archive
manifest = json.loads((ROOT.parents[1] / 'UPSTREAM.json').read_text())
assert hashlib.sha256(archive_path.read_bytes()).hexdigest() == manifest['archiveSha256'], 'baseline archive digest mismatch'


def methods(relative, class_name, names):
    with tarfile.open(archive_path) as archive:
        suffix = '/workflows/workflow_use/' + relative
        members = [member for member in archive.getmembers() if member.isfile() and member.name.endswith(suffix)]
        assert len(members) == 1
        module = ast.parse(archive.extractfile(members[0]).read().decode())
    cls = next(n for n in module.body if isinstance(n, ast.ClassDef) and n.name == class_name)
    selected = [n for n in cls.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in names]
    assert len(selected) == len(names)
    unit = ast.Module(body=[ast.ImportFrom(module='__future__', names=[ast.alias(name='annotations')], level=0),
                           ast.ClassDef(name=class_name, bases=[], keywords=[], body=selected, decorator_list=[])], type_ignores=[])
    namespace = {'logger': logging.getLogger('probe')}
    exec(compile(ast.fix_missing_locations(unit), str(ROOT / relative), 'exec'), namespace)
    return namespace, namespace[class_name]


async def main():
    ns, Executor = methods('workflow/semantic_executor.py', 'SemanticWorkflowExecutor',
                           ['execute_step', '_select_element_by_position'])
    # Schema classes are distinct siblings in the original schema; only their identity is needed for dispatch.
    for name in ['NavigationStep', 'ClickStep', 'InputStep', 'SelectChangeStep', 'KeyPressStep', 'ScrollStep', 'ExtractStep']:
        ns[name] = type(name, (), {})
    executor = Executor()
    refreshes = []

    async def refresh():
        refreshes.append(True)

    executor._refresh_semantic_mapping = refresh
    try:
        await executor.execute_step(SimpleNamespace(type='extract_page_content'))
    except Exception as exc:
        assert str(exc) == 'Unsupported step type: extract_page_content'
    else:
        raise AssertionError('expected unsupported page extraction')
    # An out-of-range ordinal must be missing, never a different item.
    first = {'id': 'first'}
    ordinal_result = executor._select_element_by_position([('entry', first, 1)], '2', 'list')
    assert ordinal_result == first

    _, Converter = methods('healing/deterministic_converter.py', 'DeterministicWorkflowConverter',
                           ['__init__', '_convert_action_to_step', '_add_wait_time_to_step'])
    converter = Converter()
    with contextlib.redirect_stdout(io.StringIO()):
        skipped = {name: converter._convert_action_to_step(name, {}, None, {})
                   for name in ['future_action', 'wait', 'switch_tab', 'write_file', 'replace_file']}
        extraction = converter._convert_action_to_step('extract', {'query': 'bounded fixture'}, None, {})
    assert all(value is None for value in skipped.values())
    assert extraction['type'] == 'extract_page_content'
    return {'scope': 'unchanged method AST with in-memory ports; not installed package or real browser acceptance',
            'sourceCommit': '5d2d19fe8835cc86f1bf3e04302a5000d590f249',
            'schemaExecutorMismatch': {'generated': extraction['type'], 'executor': 'unsupported'},
            'ordinalOutOfRange': {'requested': 2, 'available': 1, 'actual': 'first', 'expected': 'missing'},
            'silentlySkipped': list(skipped), 'browserSessions': 0, 'modelCalls': 0,
            'admittedWholeConverter': False, 'admittedSemanticExecutor': False}


print(json.dumps(asyncio.run(main()), indent=2))
