"""Post-action target reads require a pre-verified stable query, never an XPath guess."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from workflow_use.hybrid.post_action_target import CapturedTargetIdentity, refreshed_target_element


class PostActionTargetTests(unittest.IsolatedAsyncioTestCase):
    async def test_xpath_identity_without_verified_query_is_not_refreshed(self):
        url = 'https://fixture.invalid/form'
        node = SimpleNamespace(node_name='button', xpath='html/body/button[1]', target_id='target-live',
                               frame_id=None, shadow_root_type=None, attributes={'id': 'submit'},
                               backend_node_id=10)
        page = SimpleNamespace(get_url=AsyncMock(return_value=url),
            get_target_info=AsyncMock(return_value={'targetId': 'target-live'}),
            get_elements_by_css_selector=AsyncMock(return_value=[object()]),
            get_element=AsyncMock(return_value=object()))
        browser = SimpleNamespace(agent_focus_target_id='target-live',
                                  get_current_page=AsyncMock(return_value=page))
        summary = SimpleNamespace(url=url, dom_state=SimpleNamespace(selector_map={7: node}))
        identity = CapturedTargetIdentity(target_id='target-live', url=url,
            tag='button', attributes={'id': 'submit'}, backend=10)

        with self.assertRaisesRegex(ValueError, 'target_refresh_identity_unavailable'):
            await refreshed_target_element(browser, summary, identity)

    async def test_preverified_unique_label_query_can_refresh_the_logical_target(self):
        url = 'https://fixture.invalid/form'
        node = SimpleNamespace(node_name='button', target_id='target-live', frame_id=None,
            shadow_root_type=None, attributes={'aria-label': 'Submit'}, backend_node_id=10)
        queried = SimpleNamespace(get_basic_info=AsyncMock(return_value={'backendNodeId': 10}))
        expected = object()
        page = SimpleNamespace(get_url=AsyncMock(return_value=url),
            get_target_info=AsyncMock(return_value={'targetId': 'target-live'}),
            get_elements_by_css_selector=AsyncMock(side_effect=[[queried], [object()]]),
            get_element=AsyncMock(return_value=expected))
        browser = SimpleNamespace(agent_focus_target_id='target-live',
                                  get_current_page=AsyncMock(return_value=page))
        summary = SimpleNamespace(url=url, dom_state=SimpleNamespace(selector_map={7: node}))
        identity = CapturedTargetIdentity(target_id='target-live', url=url, tag='button',
            attributes={'aria-label': 'Submit'}, backend=10,
            selector='button[aria-label="Submit"]')

        actual = await refreshed_target_element(browser, summary, identity)

        self.assertIs(actual, expected)


if __name__ == '__main__':
    unittest.main()
