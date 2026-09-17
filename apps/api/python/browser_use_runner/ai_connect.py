"""Call-shape adapter only. Browser strategy and Agent loops belong to upstream."""
import uuid
import re
from typing import Any, Literal

import aiohttp
from pydantic import BaseModel, Field
from browser_use.llm.messages import BaseMessage, UserMessage
from browser_use.llm.views import ChatInvokeCompletion, ChatInvokeUsage

Purpose = Literal["agent", "judge", "workflow_generation", "variable_suggestion", "extract", "output_conversion", "semantic_annotation"]


class BridgeCompletion(ChatInvokeCompletion):
    @property
    def content(self):
        # WHY：workflow-use 的 extract 读 .content，其余上游读 .completion；不更改抽取策略。
        if not isinstance(self.completion, str):
            raise TypeError("bridge_text_completion_required")
        return self.completion


def wire_messages(messages: list[BaseMessage] | str):
    if isinstance(messages, str):
        messages = [UserMessage(content=messages)]
    system, result = [], []
    for message in messages:
        if message.name or getattr(message, "tool_calls", []) or getattr(message, "refusal", None):
            raise ValueError("bridge_message_feature_unsupported")
        if message.role == "system":
            if result:
                raise ValueError("bridge_late_system_message_unsupported")
            system.append(message.text)
        elif message.role == "assistant":
            if isinstance(message.content, list) and any(part.type != "text" for part in message.content):
                raise ValueError("bridge_assistant_content_unsupported")
            result.append({"role": "assistant", "content": message.text})
        elif isinstance(message.content, str):
            result.append({"role": "user", "content": message.content})
        else:
            result.append({"role": "user", "content": [wire_part(part) for part in message.content]})
    return {"messages": result, **({"system": "\n".join(system)} if system else {})}


def wire_part(part):
    if part.type == "text":
        return {"type": "text", "text": part.text}
    image = part.image_url
    match = re.fullmatch(r"data:(image/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)", image.url)
    if match is None or image.detail != "auto":
        raise ValueError("bridge_image_format_unsupported")
    # WHY：上游生成器可能省略 media_type 字段而使用默认值；data URL 是实际发送内容的 MIME 声明。
    return {"type": "image", "mediaType": match[1], "data": match[2]}


class AIConnectModel(BaseModel):
    model: str
    endpoint: str
    token: str = Field(exclude=True, repr=False)
    purpose: Purpose

    @property
    def provider(self):
        return "ai-connect"

    @property
    def name(self):
        return self.model

    @property
    def model_name(self):
        return self.model

    async def ainvoke(self, messages: list[BaseMessage] | str, output_format: type[BaseModel] | None = None,
                      **kwargs: Any):
        session_id = kwargs.pop("session_id", None)
        if kwargs:
            raise ValueError("bridge_model_options_unsupported")
        body = {"id": str(uuid.uuid4()), "purpose": self.purpose, **wire_messages(messages)}
        if session_id is not None:
            body["upstreamSessionId"] = session_id
        if output_format is not None:
            body["jsonSchema"] = output_format.model_json_schema()
        timeout = aiohttp.ClientTimeout(total=180)
        async with aiohttp.ClientSession(timeout=timeout, trust_env=False) as client:
            async with client.post(self.endpoint + "/invoke", json=body,
                                   headers={"Authorization": "Bearer " + self.token}) as response:
                result = await response.json()
                if response.status != 200:
                    raise RuntimeError(result.get("error", "bridge_request_failed"))
        completion = result["completion"]
        if output_format is not None:
            completion = output_format.model_validate(completion)
        usage = result["usage"]
        return BridgeCompletion(completion=completion, usage=ChatInvokeUsage(
            prompt_tokens=usage["inputTokens"], completion_tokens=usage["outputTokens"],
            total_tokens=usage["totalTokens"], prompt_cached_tokens=None,
            prompt_cache_creation_tokens=None, prompt_image_tokens=None) if usage.get("reported", True) else None)
