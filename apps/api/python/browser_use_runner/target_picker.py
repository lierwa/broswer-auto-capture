"""Pick one real page target without persisting page text or raw DOM."""
import json
from uuid import uuid4

from workflow_use.hybrid.dom_evidence import node_value
from workflow_use.hybrid.post_action_target import capture_target_identity, verified_labeled_query


MARKER_ATTRIBUTE = 'data-bat-target-picker'
PICKER_STATE = '__batTargetPickerV1'


async def pick_target(browser, timeout_ms):
    session = await browser.get_or_create_cdp_session()
    marker = uuid4().hex
    try:
        selected = await session.cdp_client.send.Runtime.evaluate(
            params={'expression': _picker_script(marker, timeout_ms), 'returnByValue': True, 'awaitPromise': True},
            session_id=session.session_id)
        value = selected.get('result', {}).get('value')
        if not isinstance(value, dict) or value.get('marker') != marker:
            raise ValueError('target_selection_timeout')
        summary = await browser.get_browser_state_summary(include_screenshot=False)
        selector_index = _marked_selector_index(summary, marker)
        target_id = browser.agent_focus_target_id
        identity = capture_target_identity(summary, selector_index, str(target_id))
        identity, query = await verified_labeled_query(browser, summary, identity)
        scope = {'url': identity.url}
        if query is not None:
            target = {**query, 'scope': scope}
            strategy = 'structure'
        else:
            target = {'strategy': 'history', 'scope': scope,
                      'identity': identity.history.model_dump(mode='json', by_alias=True)}
            strategy = 'history'
        return {'target': target, 'tag': identity.tag, 'strategy': strategy}
    finally:
        try:
            await session.cdp_client.send.Runtime.evaluate(
                params={'expression': _cleanup_script(marker), 'returnByValue': True},
                session_id=session.session_id)
        except Exception:
            pass


def _marked_selector_index(summary, marker):
    mapping = getattr(getattr(summary, 'dom_state', None), 'selector_map', {}) or {}
    matches = []
    for index, node in mapping.items():
        attributes = node_value(node, 'attributes') or {}
        if isinstance(attributes, dict) and attributes.get(MARKER_ATTRIBUTE) == marker:
            matches.append(int(index))
    if len(matches) != 1:
        raise ValueError('target_selection_target_unavailable')
    return matches[0]


def _picker_script(marker, timeout_ms):
    state = json.dumps(PICKER_STATE)
    attribute = json.dumps(MARKER_ATTRIBUTE)
    marker_value = json.dumps(marker)
    return f"""(() => {{
      globalThis[{state}]?.cleanup?.();
      return new Promise((resolve) => {{
        const attribute = {attribute};
        const marker = {marker_value};
        const banner = document.createElement('div');
        banner.setAttribute('data-bat-picker-ui', 'true');
        banner.textContent = 'B-A-T：请点击要绑定的页面目标（页面动作不会执行）';
        Object.assign(banner.style, {{position:'fixed',left:'16px',right:'16px',top:'16px',zIndex:'2147483647',
          padding:'12px 16px',background:'#171714',color:'#fff',border:'2px solid #e6a700',borderRadius:'8px',
          font:'600 14px/1.4 system-ui,sans-serif',boxShadow:'0 8px 28px #0008',pointerEvents:'none'}});
        document.documentElement.appendChild(banner);
        let timer;
        const cleanup = () => {{
          document.removeEventListener('click', choose, true);
          clearTimeout(timer);
          banner.remove();
        }};
        const choose = (event) => {{
          const target = event.target instanceof Element ? event.target.closest('*') : null;
          if (!target || target.closest('[data-bat-picker-ui]')) return;
          event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
          target.setAttribute(attribute, marker);
          cleanup();
          resolve({{marker, tag: target.tagName.toLowerCase()}});
        }};
        globalThis[{state}] = {{cleanup}};
        document.addEventListener('click', choose, true);
        timer = setTimeout(() => {{ cleanup(); resolve({{timeout: true}}); }}, {int(timeout_ms)});
      }});
    }})()"""


def _cleanup_script(marker):
    state = json.dumps(PICKER_STATE)
    attribute = json.dumps(MARKER_ATTRIBUTE)
    marker_value = json.dumps(marker)
    return f"""(() => {{
      globalThis[{state}]?.cleanup?.(); delete globalThis[{state}];
      const node = document.querySelector('[' + {attribute} + '=' + JSON.stringify({marker_value}) + ']');
      node?.removeAttribute({attribute});
      document.querySelectorAll('[data-bat-picker-ui]').forEach((item) => item.remove());
    }})()"""
