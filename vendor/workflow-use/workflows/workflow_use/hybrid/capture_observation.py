"""Consistent, sanitized observation facts for the native Agent callback adapter."""
import time

from .browser_context import browser_context_value
from .dom_evidence import safe_url
from .evidence import NormalizedObservation, ObservationFact, digest
from .postconditions import read_fact
from .snapshot_consistency import ObservationUrlChanged


class ObservationCapture:
    async def observe(self, summary, facts, *, expected_tab_id=None):
        tab_id = expected_tab_id if expected_tab_id is not None else self.browser.agent_focus_target_id
        if self.browser.agent_focus_target_id != tab_id:
            raise ValueError('observation_tab_changed')
        if not tab_id or tab_id not in {tab.target_id for tab in summary.tabs}:
            raise ValueError('observation_tab_identity_unavailable')
        # WHY：summary.title 来自异步 Target 缓存；即时事实用同一 tab 的公开 Page 查询。
        try:
            title = await read_fact('title', None, self.browser)
        except Exception as error:
            if self.observation_scope is not None:
                self.observation_scope.callbacks.record_before_action_detail('observation_title', error)
            raise
        try:
            live_url = await read_fact('url', None, self.browser)
        except Exception as error:
            if self.observation_scope is not None:
                self.observation_scope.callbacks.record_before_action_detail('observation_url', error)
            raise
        if self.observation_scope is not None:
            self.observation_scope.record_live_url(summary, tab_id, live_url)
        if self.browser.agent_focus_target_id != tab_id:
            raise ValueError('observation_tab_changed')
        if not isinstance(summary.url, str) or digest(summary.url) != digest(live_url):
            raise ObservationUrlChanged()
        observed_url = safe_url(live_url)
        if observed_url is None:
            raise ValueError('observation_url_unavailable')
        body = {'url': observed_url, 'tabId': str(tab_id), 'titleDigest': digest(title)}
        reference = self.put_evidence('observation', body)
        values = [self.value_fact('browser_context', browser_context_value(summary, tab_id)),
                  self.fact('url', observed_url), self.fact('url_digest', digest(live_url)), self.fact('title', title),
                  self.fact('monotonic_ms', time.monotonic_ns() // 1000000), *facts]
        identity = self.observation_scope.document_identity(summary) if self.observation_scope is not None else None
        if identity is not None:
            values.append(self.value_fact('document_identity', identity))
        observation = NormalizedObservation(id=f'o-{len(self.observations) + 1:04d}', sequence=len(self.observations),
            url=observed_url, tabId=str(tab_id), facts=values, sourceRefs=[reference],
            documentDigest=digest(summary.dom_state.llm_representation())
            if hasattr(summary.dom_state, 'llm_representation') else None)
        self.observations.append(observation)
        return observation

    def fact(self, kind, value):
        reference = self.put_evidence('fact', {'kind': kind, 'value': value})
        return ObservationFact(id='fact-' + reference.digest, kind=kind, value=value, sourceRefs=[reference])

    def value_fact(self, kind, value):
        reference = self.put_evidence(kind.replace('_', '-'), value)
        return ObservationFact(id='fact-' + reference.digest, kind=kind, value=value, sourceRefs=[reference])

    def dom_fact(self, value):
        return self.value_fact('dom_structure', value.model_dump(mode='json'))

    def dom_query_fact(self, value):
        return self.value_fact('dom_query', value.model_dump(mode='json'))
