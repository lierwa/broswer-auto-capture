"""Classifier authority tests: no samples, skipped actions, or unproven effects become candidates."""
import unittest
import tempfile
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock, patch

from browser_use.tools.service import Tools
from browser_use.agent.prompts import AgentMessagePrompt
from browser_use.browser.events import UploadFileEvent
from browser_use.dom.views import EnhancedDOMTreeNode, NodeType

from workflow_use.hybrid.compiler import compile_request
from workflow_use.hybrid.evidence import EvidenceRef, NormalizedObservation, ObservationFact, TraceSource, digest
from workflow_use.hybrid.history import retain_not_dispatched_action_facts
from workflow_use.hybrid.normalize import HistoryInput, HistoryRecord, ResultEvidence, normalize_history
from workflow_use.hybrid.registry import ActionRegistry
from workflow_use.hybrid.request import CompilationRequest
from workflow_use.hybrid.capability import OrdinaryCapability
from workflow_use.hybrid.native_files import NativeFileContext, prepare_native_file_capture, capture_native_tool_facts, checked_file
from browser_use.filesystem.file_system import FileSystem, FileSystemError

REF = EvidenceRef(ref='fixture:captured', digest='1' * 64)


class NativeCloseFactsBrowser:
    def __init__(self, *, remove=True):
        self.owned = ['owned-target-0001', 'owned-target-0002', 'owned-target-0003']
        self.blank = 'owned-blank-0000'
        self.cached = [*self.owned, self.blank]
        self.live = {*self.cached, 'personal-target-9999'}
        self.agent_focus_target_id = self.owned[0]
        self.switched = []
        self.rebound = []
        self._bat_close_allowed_url = lambda url: url == 'https://fixture.invalid/'
        self.closed = []
        self.remove = remove
        self.cdp_client = SimpleNamespace(send=SimpleNamespace(Target=SimpleNamespace(getTargets=self.targets)))
        self.event_bus = SimpleNamespace(dispatch=self.dispatch)

    async def get_tabs(self):
        # Native SessionManager deliberately retains its old projection in this counterexample.
        return [SimpleNamespace(target_id=identity) for identity in self.cached]

    async def get_target_id_from_tab_id(self, suffix):
        matches = [identity for identity in self.cached if identity.endswith(suffix)]
        if len(matches) != 1:
            raise ValueError('target_not_unique')
        return matches[0]

    async def targets(self, params):
        return {'targetInfos': [{'targetId': identity, 'type': 'page',
            'url': 'https://fixture.invalid/' if identity in self.owned else 'about:blank'} for identity in self.live]}

    async def on_SwitchTabEvent(self, event):
        if self.agent_focus_target_id is None:
            raise RuntimeError('Cannot switch tabs - browser not connected')
        self.switched.append(event.target_id)
        self.agent_focus_target_id = event.target_id

    async def get_or_create_cdp_session(self, target_id, focus=True):
        if target_id not in self.live:
            raise ValueError('session_detached')
        self.rebound.append(target_id)
        if focus:
            self.agent_focus_target_id = target_id
        return SimpleNamespace()

    def dispatch(self, event):
        self.closed.append(event.target_id)
        if self.remove:
            self.live.remove(event.target_id)
            if self.agent_focus_target_id == event.target_id:
                self.agent_focus_target_id = None
        class Result:
            def __await__(self):
                return self.event_result().__await__()

            async def event_result(self, **_kwargs):
                return None
        return Result()


class NativeCloseCapabilityTests(unittest.IsolatedAsyncioTestCase):
    async def dispatch_without_dialog(self, work, _policy):
        return await work()

    async def test_native_close_uses_live_facts_and_cached_or_personal_tabs_cannot_bypass_last_tab_guard(self):
        browser = NativeCloseFactsBrowser()
        capability = OrdinaryCapability(browser)
        with patch.object(capability, '_with_dialog_bridge', self.dispatch_without_dialog):
            for identity in browser.owned[1:]:
                if identity == browser.owned[-1]:
                    browser.agent_focus_target_id = identity
                result = await capability.execute('close', {'tab_id': identity})
                self.assertIsNone(result.error)
                if identity == browser.owned[1]:
                    # Two legal pages remain: the SDK's existing legal focus needs no reconciliation.
                    self.assertEqual(browser.switched, [])
            self.assertEqual(browser.closed, browser.owned[1:])
            self.assertEqual(len(await browser.get_tabs()), 4)
            self.assertEqual(browser.agent_focus_target_id, browser.owned[0])
            self.assertEqual(browser.switched, [browser.owned[0]])
            self.assertEqual(browser.rebound, [browser.owned[0]])
            with self.assertRaisesRegex(ValueError, 'switch_runtime_target_missing_or_ambiguous'):
                await capability.execute('close', {'tab_id': browser.owned[1]})
            with self.assertRaisesRegex(ValueError, 'native_close_last_owned_tab_unsupported'):
                await capability.execute('close', {'tab_id': browser.owned[0]})
            self.assertEqual(browser.closed, browser.owned[1:])
            self.assertIn('personal-target-9999', browser.live)

    async def test_native_close_text_does_not_prove_a_still_existing_target_closed(self):
        browser = NativeCloseFactsBrowser(remove=False)
        capability = OrdinaryCapability(browser)
        with patch.object(capability, '_with_dialog_bridge', self.dispatch_without_dialog):
            with self.assertRaisesRegex(ValueError, 'native_close_unconfirmed'):
                await capability.execute('close', {'tab_id': browser.owned[1]})
        self.assertEqual(browser.closed, [browser.owned[1]])
        self.assertIn(browser.owned[1], browser.live)


class NativeFileCapabilityTests(unittest.IsolatedAsyncioTestCase):
    async def test_attached_upload_uses_verified_bytes_and_source_agent_current_public_file_paths(self):
        node = EnhancedDOMTreeNode(node_id=1, backend_node_id=1, node_type=NodeType.ELEMENT_NODE,
            node_name='INPUT', node_value='', attributes={'type': 'file'}, is_scrollable=False, is_visible=True,
            absolute_position=None, target_id='owned-target', frame_id='frame', session_id='session',
            content_document=None, shadow_root_type=None, shadow_roots=None, parent_node=None,
            children_nodes=None, ax_node=None, snapshot_node=None)
        uploaded = []
        def dispatch(event):
            self.assertIsInstance(event, UploadFileEvent)
            uploaded.append((event.file_path, Path(event.file_path).read_bytes()))
            class Result:
                def __await__(self):
                    return self.event_result().__await__()
                async def event_result(self, **_kwargs):
                    return None
            return Result()
        browser = SimpleNamespace(is_local=False, cdp_client=None, downloaded_files=[], event_bus=SimpleNamespace(dispatch=dispatch),
            get_selector_map=AsyncMock(return_value={1: node}), find_file_input_near_element=lambda value: value,
            highlight_interaction_element=AsyncMock())
        with tempfile.TemporaryDirectory(prefix='bat-native-upload-test-') as directory:
            context = NativeFileContext(directory, uuid4())
            source_fs = FileSystem(Path(directory) / 'source-agent', create_default_files=False)
            agent = SimpleNamespace(available_file_paths=[])
            collector = SimpleNamespace(native_file_system=source_fs, native_available_file_paths=lambda: agent.available_file_paths,
                browser=SimpleNamespace(is_local=False, _bat_native_file_context=context), source_gaps=[],
                pending={'actionId': 'a-0001', 'action': {}}, value_fact=lambda kind, value: (kind, value))
            tools = Tools()
            registry = ActionRegistry.from_tools(tools)
            async def act(name, args, fs, available):
                return await tools.act(registry.validate_action(name, args), browser_session=browser,
                    file_system=fs, available_file_paths=available, page_extraction_llm=None)
            try:
                args = {'file_name': 'note.txt', 'content': 'actual bytes', 'trailing_newline': False}
                await act('write_file', args, context.file_system, context.available_file_paths)
                prepared = context.prepare('upload_file', {'path': 'note.txt', 'index': 1})
                result = await act('upload_file', prepared, context.file_system, context.available_file_paths)
                self.assertIsNone(result.error)
                self.assertEqual(uploaded, [(str(context.file_system.get_dir() / 'note.txt'), b'actual bytes')])
                for name, source_args in [('write_file', args), ('replace_file', {
                        'file_name': 'note.txt', 'old_str': 'actual', 'new_str': 'source'})]:
                    agent.available_file_paths = []  # 原生download更新可替换list，采集必须读当前实例。
                    collector.pending['action'] = {name: source_args}
                    prepare_native_file_capture(collector, name, source_args)
                    result = await act(name, source_args, source_fs, agent.available_file_paths)
                    await capture_native_tool_facts(collector, result)
                    absolute = str((source_fs.get_dir() / 'note.txt').resolve())
                    self.assertEqual(agent.available_file_paths, [absolute])
                prompt = AgentMessagePrompt(SimpleNamespace(), source_fs, available_file_paths=agent.available_file_paths)
                self.assertIn(absolute + '\nUse with absolute paths', prompt._get_agent_state_description())
                with self.assertRaisesRegex(ValueError, 'native_upload_absolute_path_required'):
                    prepare_native_file_capture(collector, 'upload_file', {'path': 'note.txt', 'index': 1})
                source_args = {'path': absolute, 'index': 1}
                prepare_native_file_capture(collector, 'upload_file', source_args)
                result = await act('upload_file', source_args, source_fs, agent.available_file_paths)
                self.assertIsNone(result.error)
                self.assertEqual(source_args, {'path': absolute, 'index': 1})
                self.assertEqual(uploaded[-1], (absolute, b'source bytes'))
                await act('write_file', {**args, 'file_name': 'empty.txt', 'content': ''}, context.file_system, [])
                with self.assertRaisesRegex(ValueError, 'native_file_empty'):
                    context.prepare('upload_file', {'path': 'empty.txt', 'index': 1})
                self.assertEqual(len(uploaded), 2)
            finally:
                context.close()

    async def test_real_tools_and_filesystem_preserve_write_append_replace_read_state(self):
        with tempfile.TemporaryDirectory(prefix='bat-native-file-test-') as directory:
            context = NativeFileContext(directory, uuid4())
            capability = OrdinaryCapability(SimpleNamespace(id='file-only-test', cdp_client=None), file_context=context)
            try:
                for name, args in [
                    ('write_file', {'file_name': 'note.txt', 'content': 'first', 'trailing_newline': False}),
                    ('write_file', {'file_name': 'note.txt', 'content': ' second', 'append': True, 'trailing_newline': False}),
                    ('replace_file', {'file_name': 'note.txt', 'old_str': 'second', 'new_str': 'last'}),
                    ('read_file', {'file_name': 'note.txt'}),
                ]:
                    result = await capability.execute(name, args)
                    output = context.result(name, args, result)
                    self.assertEqual(output['files'], [])
                self.assertIn('first last', output['text'])
                self.assertEqual((context.file_system.get_dir() / 'note.txt').read_text(), 'first last')
                self.assertEqual(context.file_system.get_file('note.txt').read(), 'first last')
            finally:
                context.close()

    async def test_rejected_paths_replacement_and_owner_collision_do_not_change_files(self):
        with tempfile.TemporaryDirectory(prefix='bat-native-file-test-') as directory:
            owner = uuid4()
            context = NativeFileContext(directory, owner)
            other = NativeFileContext(directory, owner)
            capability = OrdinaryCapability(SimpleNamespace(id='file-only-test', cdp_client=None), file_context=context)
            try:
                args = {'file_name': 'note.txt', 'content': 'original', 'trailing_newline': False}
                context.result('write_file', args, await capability.execute('write_file', args))
                for value in ('../note.txt', 'sub/note.txt', 'sub\\note.txt'):
                    with self.assertRaisesRegex(ValueError, 'native_file_name_invalid'):
                        await capability.execute('read_file', {'file_name': value})
                with self.assertRaisesRegex(ValueError, 'native_file_replace_text_missing'):
                    await capability.execute('replace_file', {'file_name': 'note.txt', 'old_str': 'absent', 'new_str': 'changed'})
                self.assertEqual((context.file_system.get_dir() / 'note.txt').read_text(), 'original')
                outside_file = Path(directory) / 'foreign.txt'
                outside_file.write_text('foreign bytes')
                linked = context.file_system.get_dir() / 'linked.txt'
                linked.symlink_to(outside_file)
                for candidate in (outside_file, linked):
                    with self.assertRaisesRegex(ValueError, 'native_file_owner_mismatch'):
                        checked_file(candidate, context.file_system.get_dir())
                self.assertEqual(outside_file.read_text(), 'foreign bytes')
                self.assertIsNone(other.file_system.get_file('note.txt'))
                self.assertNotEqual(context.root, other.root)
                second_owner = uuid4()
                outside = Path(directory) / 'outside'
                outside.mkdir()
                (Path(directory) / 'native-files' / str(second_owner)).symlink_to(outside, target_is_directory=True)
                with self.assertRaisesRegex(ValueError, 'native_file_owner_mismatch'):
                    NativeFileContext(directory, second_owner)
                self.assertEqual(list(outside.iterdir()), [])
                for extension in ('pdf', 'docx'):
                    with self.assertRaisesRegex(ValueError, 'native_binary_file_write_unverified'):
                        await capability.execute('write_file', {**args, 'file_name': 'note.' + extension})
            finally:
                context.close()
                other.close()

    async def test_native_failed_append_retains_partial_bytes_without_replay(self):
        with tempfile.TemporaryDirectory(prefix='bat-native-file-test-') as directory:
            context = NativeFileContext(directory, uuid4())
            capability = OrdinaryCapability(SimpleNamespace(id='file-only-test', cdp_client=None), file_context=context)
            try:
                args = {'file_name': 'note.txt', 'content': 'original', 'trailing_newline': False}
                context.result('write_file', args, await capability.execute('write_file', args))
                calls = []
                async def interrupted_append(name, content):
                    calls.append(name)
                    (context.file_system.get_dir() / name).write_text('original partial')
                    raise OSError('fixture_partial_write')
                with patch.object(context.file_system, 'append_file', interrupted_append):
                    with self.assertRaisesRegex(RuntimeError, 'ordinary_action_failed'):
                        await capability.execute('write_file', {**args, 'content': ' whole', 'append': True})
                self.assertEqual(calls, ['note.txt'])
                self.assertEqual((context.file_system.get_dir() / 'note.txt').read_text(), 'original partial')
            finally:
                context.close()

    async def test_native_error_text_cannot_claim_old_file_bytes_as_a_successful_write(self):
        with tempfile.TemporaryDirectory(prefix='bat-native-file-test-') as directory:
            context = NativeFileContext(directory, uuid4())
            capability = OrdinaryCapability(SimpleNamespace(id='file-only-test', cdp_client=None), file_context=context)
            try:
                args = {'file_name': 'note.txt', 'content': 'original', 'trailing_newline': False}
                context.result('write_file', args, await capability.execute('write_file', args))
                item = context.file_system.get_file('note.txt')
                async def disk_write_failed(_self, _directory):
                    raise FileSystemError('fixture_disk_write_failed')
                changed = {**args, 'content': 'changed'}
                collector = SimpleNamespace(native_file_system=context.file_system,
                    browser=SimpleNamespace(_bat_native_file_context=context), source_gaps=[],
                    pending={'actionId': 'a-0001', 'action': {'write_file': changed}}, value_fact=lambda kind, value: (kind, value))
                prepare_native_file_capture(collector, 'write_file', changed)
                with patch.object(type(item), 'sync_to_disk', disk_write_failed):
                    result = await capability.execute('write_file', changed)
                    self.assertIsNone(result.error)  # 原生FileSystem用返回文字承载失败。
                    with self.assertRaisesRegex(ValueError, 'native_file_write_unconfirmed'):
                        context.result('write_file', changed, result)
                self.assertEqual(await capture_native_tool_facts(collector, result), [])
                self.assertEqual([issue.reason for issue in collector.source_gaps], ['native_file_write_unconfirmed'])
                self.assertEqual((context.file_system.get_dir() / 'note.txt').read_text(), 'original')
                prepare_native_file_capture(collector, 'read_file', {'file_name': 'missing.txt'})
                self.assertEqual(collector.native_file_pre_gap, 'native_file_missing')
                unsupported = {**args, 'file_name': 'note.exe'}
                result = await capability.execute('write_file', unsupported)
                self.assertIsNone(result.error)
                with self.assertRaisesRegex(ValueError, 'native_file_write_unconfirmed'):
                    context.result('write_file', unsupported, result)
            finally:
                context.close()


def navigation_request(registry):
    observations = [NormalizedObservation(id=f'o-{i + 1:04d}', sequence=i, url=url, tabId='tab-1', facts=[],
                    sourceRefs=[REF]) for i, url in enumerate(['https://fixture.invalid/', 'https://fixture.invalid/next'])]
    records = [HistoryRecord(stepIndex=0, actions=[{'navigate': {'url': observations[1].url, 'new_tab': False}}],
               results=[ResultEvidence(errorPresent=False, ref=REF)], preObservationRef='o-0001',
               postObservationRefs={'0': 'o-0002'})]
    trace, issues = normalize_history(HistoryInput(source=TraceSource(version='0.13.8', historyRef='fixture:history'),
                      completed=True, records=records, observations=observations,
                      finalResultRef=REF, redactionManifestRef=REF), registry)
    assert not issues
    schema = {'type': 'object', 'properties': {'url': {'type': 'string'}}, 'required': ['url'], 'additionalProperties': False}
    requirement = {'id': 'requirement', 'version': 1, 'clauses': [
        {'id': 'url', 'kind': 'input', 'expression': {'actionName': 'navigate', 'argumentPath': 'url',
          'binding': {'source': 'input', 'path': ['url']}}},
        {'id': 'same-tab', 'kind': 'constraint', 'expression': {'actionName': 'navigate', 'argumentPath': 'new_tab',
          'binding': {'source': 'constant', 'value': False}}}]}
    plan = {'id': 'plan', 'version': 1, 'stepId': 'step', 'inputSchemaDigest': digest(schema),
            'outputSchemaDigest': digest({'type': 'null'}), 'callMode': 'once'}
    return {'compilerVersion': 'bat-hybrid/1', 'actionRegistryVersion': registry.schemaDigest,
            'requirement': {**requirement, 'digest': digest(requirement)}, 'plan': {**plan, 'digest': digest(plan)},
            'runtimeInputSchema': schema, 'trace': trace.model_dump(),
            'control': {'selections': [], 'branches': [], 'loops': [], 'invokes': []}, 'acceptedAnnotations': []}


def rehash(body, name):
    body[name]['digest'] = digest({k: v for k, v in body[name].items() if k != 'digest'})


class CompilerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = ActionRegistry.from_tools(Tools())

    def test_navigation_has_complete_coverage_and_stable_parameter_binding(self):
        request = CompilationRequest.model_validate(navigation_request(self.registry))
        self.assertEqual(request.trace.mediaType, 'application/vnd.bat.browser-use-trace+json;version=2')
        self.assertNotIn('judged', request.trace.model_dump(mode='json'))
        result = compile_request(request, self.registry)
        self.assertFalse(result.gaps)
        self.assertEqual(len(result.coverage), 1)
        self.assertEqual(result.coverage[0].disposition, 'compiled')
        self.assertEqual(result.segments[0]['bindings'][1]['kind'], 'runtime_input')
        self.assertNotIn('fixture.invalid', str(result.segments))
        self.assertNotIn('outputAssembly', result.model_dump(mode='json'))
        self.assertEqual(result.canonicalDigest, compile_request(request, self.registry).canonicalDigest)

        legacy = navigation_request(self.registry)
        legacy['trace']['mediaType'] = 'application/vnd.bat.browser-use-trace+json;version=1'
        legacy['trace']['judged'] = False
        rehash(legacy, 'trace')
        legacy_result = compile_request(CompilationRequest.model_validate(legacy), self.registry)
        self.assertFalse(legacy_result.gaps)

    def test_not_dispatched_failure_gets_an_auditable_pre_observation(self):
        facts = [ObservationFact(id='fact-dispatch', kind='native_action_dispatch', value={
            'actionRef': 'a-0001'}, sourceRefs=[REF])]
        state = type('State', (), {'url': 'https://fixture.invalid/issues', 'tabs': [
            type('Tab', (), {'url': 'https://fixture.invalid/issues', 'target_id': 'tab-1'})(),
        ]})()
        observations, links = [], {}

        attached = retain_not_dispatched_action_facts(
            0, 0, type('Item', (), {'state': state})(), facts, observations, links,
            lambda _kind, value: EvidenceRef(ref='fixture:observation', digest=digest(value)))

        self.assertTrue(attached)
        self.assertEqual(links[(0, 0, 'pre')], observations[0].id)
        self.assertEqual(observations[0].facts, facts)
        self.assertEqual(observations[0].tabId, 'tab-1')

    def test_missing_binding_is_never_replaced_by_sample(self):
        raw = navigation_request(self.registry)
        raw['requirement']['clauses'].pop(0)
        rehash(raw, 'requirement')
        result = compile_request(CompilationRequest.model_validate(raw), self.registry)
        self.assertIn('sample_value_leak', [g['code'] for g in result.gaps])
        self.assertEqual(result.controlGraph['entry'], '')

    def test_changed_effect_or_missing_observation_blocks_materialization(self):
        for mutation in ('url', 'post'):
            raw = navigation_request(self.registry)
            if mutation == 'url':
                raw['trace']['observations'][1]['url'] = 'https://fixture.invalid/wrong'
            else:
                raw['trace']['actions'][0]['postObservationRef'] = None
            rehash(raw, 'trace')
            result = compile_request(CompilationRequest.model_validate(raw), self.registry)
            self.assertTrue(result.gaps)
            self.assertEqual(result.segments, [])

    def test_stale_authority_and_extra_graph_fields_rejected_at_boundary(self):
        raw = navigation_request(self.registry)
        raw['requirement']['version'] = 2
        with self.assertRaisesRegex(ValueError, 'authority_digest_mismatch'):
            CompilationRequest.model_validate(raw)
        raw = navigation_request(self.registry)
        raw['nodes'] = []
        with self.assertRaises(ValueError):
            CompilationRequest.model_validate(raw)

    def test_unregistered_action_cannot_be_classified_as_llm(self):
        raw = navigation_request(self.registry)
        raw['trace']['actions'][0]['name'] = 'future_action'
        rehash(raw, 'trace')
        result = compile_request(CompilationRequest.model_validate(raw), self.registry)
        self.assertEqual(result.segments, [])
        self.assertIn('unsupported_action', [g['code'] for g in result.gaps])


if __name__ == '__main__':
    unittest.main()
