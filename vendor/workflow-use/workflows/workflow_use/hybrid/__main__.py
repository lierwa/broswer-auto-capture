"""Offline compiler process boundary. No Browser, Agent, profile, or model is created."""
import json
import sys

from browser_use.tools.service import Tools
from pydantic import TypeAdapter

from .compiler import compile_request
from .registry import ActionRegistry
from .request import CompilationRequest, NaturalCompilationRequest

REQUEST = TypeAdapter(CompilationRequest | NaturalCompilationRequest)


def compilation_response(request, registry, verified_children=(), source_gaps=(), *, output_schema=None):
    compilation = compile_request(request, registry, verified_children, source_gaps, output_schema=output_schema)
    result = compilation.model_dump(mode='json')
    canonical = lambda value: json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)
    sources = _compilation_sources(request)
    return {'compilation': result, 'canonicalPayload': canonical({k: v for k, v in result.items() if k != 'canonicalDigest'}),
            'sourcePayloads': [canonical(value) for value in sources]}


def _compilation_sources(request):
    if isinstance(request, NaturalCompilationRequest):
        # WHY：sourcePayloads 与返回给 TypeScript 的普通 request 必须使用同一公共字段名，否则摘要相同也无法证明同一语义。
        return [request.requirement.model_dump(exclude={'digest'}, by_alias=True),
                request.plan.model_dump(exclude={'digest'}, by_alias=True),
                request.trace.model_dump(exclude={'digest'}, by_alias=True), request.runtimeInputSchema, []]
    return [request.requirement.model_dump(exclude={'digest'}), request.plan.model_dump(exclude={'digest'}),
            request.trace.model_dump(exclude={'digest'}), request.control.model_dump(),
            [item.model_dump() for item in request.acceptedAnnotations]]


def main():
    payload = sys.stdin.buffer.read(8_000_001)
    if len(payload) > 8_000_000:
        raise ValueError('compilation_input_limit')
    request = REQUEST.validate_json(payload)
    # The host checks exact canonical bytes, including request sources, without a second canonicalizer.
    print(json.dumps(compilation_response(request, ActionRegistry.from_tools(Tools())), ensure_ascii=False, allow_nan=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'error': 'invalid_compilation_request', 'errorType': type(error).__name__}))
        sys.exit(1)
