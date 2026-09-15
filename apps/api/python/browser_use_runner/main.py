"""One Browser owner for B-A-T authoring or replay; protocol uses fd 3, never stdout."""
import asyncio
import hashlib
import json
import os
import re
import signal
import sys
import traceback
from pathlib import Path
from typing import Any

from browser_use import Agent, Browser
from pydantic import BaseModel, ConfigDict, create_model
from workflow_use import Workflow
from workflow_use.healing.service import HealingService
from workflow_use.schema.views import WorkflowDefinitionSchema

from browser_use_runner.ai_connect import AIConnectModel


class Runner:
    def __init__(self, protocol):
        self.protocol = protocol
        self.browser = None
        self.config = None
        self.artifact_root = None

    async def handle(self, request):
        request_id = request["id"]
        try:
            kind = request["type"]
            if kind == "start":
                result = await self.start(request["config"])
            elif kind == "author":
                result = await self.author(request)
            elif kind == "replay":
                result = await self.replay(request)
            elif kind == "close":
                result = await self.close()
            else:
                raise ValueError("unsupported_request")
            self.respond({"id": request_id, "ok": True, "result": result})
            return kind != "close"
        except asyncio.CancelledError:
            self.respond({"id": request_id, "ok": False, "code": "upstream_cancelled"})
            raise
        except Exception as error:
            code = self.error_code(request.get("type"), error)
            diagnostic = self.write_diagnostic(request_id, error)
            self.respond({"id": request_id, "ok": False, "code": code, **({"diagnostic": diagnostic} if diagnostic else {})})
            return True

    async def start(self, config):
        self.config = config
        self.artifact_root = Path(config["artifactDirectory"]).resolve()
        self.artifact_root.mkdir(parents=True, exist_ok=True)
        browser_options = {
            "keep_alive": True,
            "headless": config["headless"],
            "use_cloud": False,
            "user_data_dir": str(self.artifact_root / "profile"),
        }
        if config.get("executablePath"):
            browser_options["executable_path"] = config["executablePath"]
        self.browser = Browser(**browser_options)
        return {"started": True}

    async def author(self, request):
        self.require_started()
        key, directory = self.artifact_directory(request["artifactKey"])
        output_model, unwrap = output_model_for(request["outputSchema"], "AgentOutput")
        models = self.models()
        agent = Agent(
            task=request["task"], browser=self.browser, llm=models["agent"], judge_llm=models["judge"],
            page_extraction_llm=models["extract"], output_model_schema=output_model,
            use_vision=True, use_judge=True, max_failures=1, enable_signal_handler=False,
            file_system_path=str(directory / "agent-files"),
        )
        history = await agent.run(max_steps=request["maxSteps"])
        history_path = directory / "history.json"
        history.save_to_file(history_path)
        if history.is_successful() is not True or history.is_validated() is not True:
            raise RuntimeError("agent_success_and_judge_required")
        structured = history.get_structured_output(output_model)
        if structured is None:
            raise RuntimeError("agent_structured_output_missing")
        generator = HealingService(
            llm=models["workflow_generation"], enable_variable_extraction=False,
            use_deterministic_conversion=False,
        )
        definition = await generator.create_workflow_definition(request["task"], history, extract_variables=False)
        definition_value = definition.model_dump(mode="json")
        self.validate_definition(history, definition, request["workflowInputs"])
        definition_path = directory / "definition.json"
        definition_path.write_text(json.dumps(definition_value, ensure_ascii=False, indent=2), encoding="utf-8")
        output = unwrap(structured)
        raw_path = directory / "author-result.json"
        raw_path.write_text(json.dumps({"output": output, "definition": definition_value}, ensure_ascii=False, indent=2), encoding="utf-8")
        return {
            "id": request["id"], "sourceSuccess": True, "sourceValidated": True, "output": output,
            "definition": definition_value, "stepTypes": [step.type for step in definition.steps],
            "workflowInputs": request["workflowInputs"], "browserCommands": action_count(history),
            "history": self.local_artifact(history_path), "rawResult": self.local_artifact(raw_path),
            "browser": await self.browser_summary(),
        }

    async def replay(self, request):
        self.require_started()
        _, directory = self.artifact_directory(request["artifactKey"])
        definition = WorkflowDefinitionSchema.model_validate(request["definition"])
        output_model, unwrap = output_model_for(request["outputSchema"], "WorkflowOutput")
        models = self.models()
        workflow = Workflow(
            definition, llm=models["output_conversion"], page_extraction_llm=models["extract"],
            browser=self.browser, fallback_to_agent=False,
        )
        result = await workflow.run_with_no_ai(
            inputs=request["inputs"], close_browser_at_end=False, output_model=output_model,
        )
        self.validate_replay(definition, result)
        if result.output_model is None:
            raise RuntimeError("workflow_output_missing")
        output = unwrap(result.output_model)
        raw_path = directory / "replay-result.json"
        raw_path.write_text(result.model_dump_json(indent=2), encoding="utf-8")
        return {
            "id": request["id"], "output": output, "stepCount": len(result.step_results),
            "browserCommands": len(result.step_results), "rawResult": self.local_artifact(raw_path),
            "browser": await self.browser_summary(),
        }

    async def close(self):
        if self.browser is not None:
            await self.browser.kill()
            self.browser = None
        return {"closed": True}

    def models(self):
        common = {key: self.config[key] for key in ["model", "endpoint", "token"]}
        return {purpose: AIConnectModel(purpose=purpose, **common) for purpose in [
            "agent", "judge", "workflow_generation", "extract", "output_conversion"
        ]}

    def validate_definition(self, history, definition, workflow_inputs):
        expected = set(workflow_inputs.values())
        actual = {item.name for item in definition.input_schema}
        if actual != expected or any(item.type not in {"string", "number", "bool"} for item in definition.input_schema):
            raise RuntimeError("workflow_primitive_input_mismatch")
        serialized = json.dumps(definition.model_dump(mode="json"), ensure_ascii=False)
        if any("{" + name + "}" not in serialized for name in expected):
            raise RuntimeError("workflow_input_placeholder_missing")
        expected_steps = [action_step(name) for name in history_actions(history)]
        actual_steps = [step.type for step in definition.steps]
        position = 0
        for expected_step in expected_steps:
            while position < len(actual_steps) and actual_steps[position] not in expected_step:
                position += 1
            if position == len(actual_steps):
                raise RuntimeError("workflow_required_action_missing")
            position += 1
        if not actual_steps or actual_steps[-1] not in {"extract", "extract_page_content"}:
            raise RuntimeError("workflow_final_extraction_missing")
        if "agent" in actual_steps:
            raise RuntimeError("workflow_agent_step_forbidden")

    def validate_replay(self, definition, result):
        if len(result.step_results) != len(definition.steps):
            raise RuntimeError("workflow_stopped_before_all_steps_completed")
        for step, item in zip(definition.steps, result.step_results):
            if not hasattr(item, "model_dump"):
                raise RuntimeError("workflow_step_result_invalid")
            value = item.model_dump(mode="json", exclude_none=True)
            if value.get("error"):
                raise RuntimeError("workflow_action_result_error")
            if step.type in {"extract", "extract_page_content"}:
                content = value.get("extracted_content") or ""
                if "AI Extraction Complete" not in content:
                    raise RuntimeError("workflow_extraction_fallback")

    async def browser_summary(self):
        url = await self.browser.get_current_page_url()
        now = __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat().replace("+00:00", "Z")
        return {
            "sessionId": str(self.browser.id), "tabId": "current", "url": url,
            "observationDigest": hashlib.sha256(url.encode()).hexdigest(), "observedAt": now,
        }

    def artifact_directory(self, raw_key):
        key = re.sub(r"[^A-Za-z0-9_-]", "_", raw_key)[:160]
        if not key:
            raise ValueError("artifact_key_invalid")
        directory = self.artifact_root / key
        directory.mkdir(parents=True, exist_ok=True)
        return key, directory

    def local_artifact(self, path):
        return {"localRef": str(path.relative_to(self.artifact_root)), "digest": file_digest(path)}

    def write_diagnostic(self, request_id, error):
        if self.artifact_root is None:
            return None
        path = self.artifact_root / f"diagnostic-{request_id}.log"
        path.write_text("".join(traceback.format_exception(error)), encoding="utf-8")
        return self.local_artifact(path)

    def error_code(self, kind, error):
        message = str(error).lower()
        if any(word in message for word in ["captcha", "login", "authentication", "verification required"]):
            return "upstream_human_required"
        return {"start": "upstream_start_failed", "author": "upstream_author_failed",
                "replay": "upstream_replay_failed"}.get(kind, "upstream_replay_failed")

    def require_started(self):
        if self.browser is None or self.config is None:
            raise RuntimeError("runner_not_started")

    def respond(self, value):
        self.protocol.write(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")
        self.protocol.flush()


def output_model_for(schema, name):
    if schema["type"] == "object":
        model = object_model(schema, name)
        return model, lambda value: value.model_dump(mode="json")
    value_type = python_type(schema, name + "Value")
    model = create_model(name, value=(value_type, ...), __config__=ConfigDict(extra="forbid"))
    return model, lambda value: value.value


def object_model(schema, name):
    fields = {}
    required = set(schema["required"])
    for key, value in schema["properties"].items():
        annotation = python_type(value, name + key.title())
        fields[key] = (annotation, ...) if key in required else (annotation | None, None)
    extra = "allow" if schema["additionalProperties"] else "forbid"
    return create_model(name, **fields, __config__=ConfigDict(extra=extra))


def python_type(schema, name):
    kind = schema["type"]
    if kind == "string":
        return str
    if kind == "number":
        return float
    if kind == "integer":
        return int
    if kind == "boolean":
        return bool
    if kind == "null":
        return type(None)
    if kind == "array":
        return list[python_type(schema["items"], name + "Item")]
    if kind == "object":
        return object_model(schema, name)
    raise ValueError("output_schema_unsupported")


def history_actions(history):
    names = []
    for item in history.history:
        model_output = item.model_output
        if model_output is None:
            continue
        for action in model_output.action:
            value = action.model_dump(mode="json", exclude_none=True)
            if len(value) != 1:
                raise RuntimeError("history_action_shape_invalid")
            names.append(next(iter(value)))
    return names


def action_count(history):
    return len([name for name in history_actions(history) if name != "done"])


def action_step(name):
    mapping = {
        "navigate": {"navigation"}, "click": {"click"}, "input": {"input"}, "scroll": {"scroll"},
        "go_back": {"go_back"}, "send_keys": {"key_press"}, "select_dropdown_option": {"select"},
        "done": {"extract", "extract_page_content"},
    }
    if name not in mapping:
        raise RuntimeError("workflow_history_action_unsupported")
    return mapping[name]


def file_digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


async def main():
    protocol = os.fdopen(3, "w", encoding="utf-8", buffering=1)
    runner = Runner(protocol)
    loop = asyncio.get_running_loop()
    task = asyncio.current_task()
    for name in ["SIGTERM", "SIGINT"]:
        if hasattr(signal, name):
            try:
                loop.add_signal_handler(getattr(signal, name), task.cancel)
            except NotImplementedError:
                pass
    for line in sys.stdin:
        request = json.loads(line)
        if not await runner.handle(request):
            break


asyncio.run(main())
