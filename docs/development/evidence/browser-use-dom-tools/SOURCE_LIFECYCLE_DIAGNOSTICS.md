# Source lifecycle diagnostics evidence

Date: 2026-09-17

Result: passed for the diagnostic adapter and offline process boundary. No formal source run, Browser session, provider request, or model call was started.

## Product alignment

- Natural-language task: diagnose the lifecycle of an already authorized source exploration before a timeout or cancellation removes in-memory state.
- Reusable chain boundary: a side-channel for the existing native Agent callbacks, action dispatch wrapper, and AI Connect audit lifecycle.
- Runtime inputs and business outputs: unchanged.
- Generic platform capability: existing Agent callbacks, `ActionDispatchAudit`, `bind_tools_act`, `modelReport`, child-process fd, and local file IO.
- Replay model calls: no additions.
- Site/task-specific code added: no.

## Persisted contract

Each owned source run writes immediately to:

```text
${applicationDirectory}/source-lifecycle-diagnostics/${ownerId}.jsonl
```

`ownerId` must be a UUID. An invalid owner disables diagnostics without creating a directory or changing source execution. Each event is fsynced and contains only:

- common: `schemaVersion`, `ownerId`, host `occurredAt`, `source`, `phase`, `status`;
- Python action phase: optional paired `actionName` and `stepNumber`, where the name is from the pinned registry allowlist;
- model phase: `callId`, `purpose`, and the normalized status derived from the existing `modelReport`.

Valid examples:

```json
{"schemaVersion":"bat.source-lifecycle-diagnostic/v1","ownerId":"11111111-1111-4111-8111-111111111111","occurredAt":"2026-09-16T22:13:28.681Z","source":"python","phase":"dispatch","status":"started","actionName":"click","stepNumber":1}
{"schemaVersion":"bat.source-lifecycle-diagnostic/v1","ownerId":"11111111-1111-4111-8111-111111111111","occurredAt":"2026-09-16T22:13:29.253Z","source":"model","phase":"model","status":"cancelled","callId":"22222222-2222-4222-8222-222222222222","purpose":"judge"}
```

The host rejects the entire fd4 line when the object has unknown fields, an unknown action name, an invalid phase/status, unpaired action metadata, or a non-safe step number. It never persists the rejected raw line. Action arguments, page content, exception text, full `AIEvent`, screenshots, and model text are not accepted fields.

## Lifecycle and failure semantics

- fd3 remains the request/response protocol. fd4 is enabled only when the owned source host supplies the private `BAT_SOURCE_LIFECYCLE_DIAGNOSTICS=1` switch.
- Compiler and ordinary capability processes do not enable the switch and do not create an owner diagnostic file.
- A missing fd4 or any diagnostic parse/write/close failure disables diagnostics without changing the business result.
- Callback and dispatch phases use `started`, `completed`, `failed`, and `cancelled`. A returned `ActionResult.error` records `failed` while returning the same object unchanged.
- `Exception` and `CancelledError` are recorded and re-raised. Python closes fd4 in `finally`; Node closes the local writer even if model bridge cleanup fails.
- Diagnostics do not add model parameters, retries, browser actions, timeouts, source facts, hashes, coverage, or judging behavior.

## Focused validation

The protocol sample `/private/tmp/bat-source-lifecycle-sample.ts` spawned real Python processes with no network, Browser, or provider/model access. It passed these gates:

- a `started` event was readable from the fsynced JSONL while the child was still running;
- a line with an extra sensitive field and a line with an unknown action name were both rejected in full;
- cancellation preserved the already written event and added `cancelled`;
- a raised `RuntimeError("business-sentinel")` still produced a non-zero child exit and its original stderr while diagnostics recorded only `failed`;
- an existing direct runner process with fd3 and no fd4 exited normally;
- a synthetic existing `ModelCallReport` mapped `interrupted` to `cancelled` without a provider call.

The first attempt at the formal transport probe patched the canonical `main.py` wrapper instead of the globals in `browser_use_runner.hybrid_main`. It returned `hybrid_runner_failed:PermissionError`; that failed attempt cannot prove zero Browser calls, and a real Browser start may have been attempted before failing. The parent process was interrupted, and a follow-up owned-process check found no launcher, canonical runner, or hybrid runner process left alive.

The corrected `/private/tmp/bat-source-lifecycle-transport.mts` used the real TypeScript `RunnerProcess(onDiagnostic)` and canonical Python `main.py`. Its temporary launcher imported the real `browser_use_runner.hybrid_main` module and replaced only `Browser` with a no-IO dummy and `author_step` with a cancellable wait. It retained the real `assert_runtime`, `AIConnectModel` construction, `OrdinaryCapability` construction, Pydantic `AuthorRequest` parsing, `Runner.handle`, `DiagnosticChannel`, fd3/fd4, signal cancellation, and cleanup loop. The corrected probe proved:

- `author/started` was fsynced while the real fd3 request promise was still pending;
- abort rejected the original request and preserved `author/cancelled`;
- the no-IO Browser substitute started and was killed exactly once, the author substitute entered exactly once, and the owned Python process exited;
- no provider call or real Browser call occurred in the corrected probe;
- an invalid owner returned no diagnostic writer and created no owner directory.

Final validation:

```text
python -m py_compile (4 changed Python files): passed
ruff check (4 changed Python files): passed
npm run check --workspace @browser-capture/api: passed
git diff --check (owned implementation files): passed
author_step physical line gate: 100
all changed implementation files: below 500 lines
```

No repository test was added or modified for this diagnostic adapter.
