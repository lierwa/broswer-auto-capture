"""Put the existing pointer trajectory before browser-use computes the click geometry."""
import asyncio
import logging

from browser_use.actor.element import Element

logger = logging.getLogger(__name__)


async def hover_before_click(element):
    try:
        await element._client.send.DOM.scrollIntoViewIfNeeded(
            params={'backendNodeId': element._backend_node_id}, session_id=element._session_id)
        await asyncio.sleep(.05)
        # WHY：慢轨迹期间布局可变；复用B-U公开hover移动后，再由原click重新计算几何。
        # 来源：固定B-U eb412692 actor/element.py；不复制坐标、遮挡或按下/释放实现。
        await Element.hover(element)
    except Exception:
        # 保留原点击对特殊/不可滚动控件的回退；取消不吞，不谎称已完成前置移动。
        logger.debug('click_prehover_unavailable')
