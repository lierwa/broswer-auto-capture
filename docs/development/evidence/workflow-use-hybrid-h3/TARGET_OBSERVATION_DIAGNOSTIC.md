# Target observation diagnostic evidence

## Product Alignment

- natural-language task: when a callback-owned target has no post-action state/value fact, retain a bounded diagnostic reason.
- reusable chain boundary: capture evidence only; target matching, waiting, compilation, and replay remain unchanged.
- runtime inputs: the existing captured action reference and target identity.
- dynamic task outputs: `target_observation_diagnostic` with `actionRef`, `stage`, and a fixed reason.
- generic platform capability used: native callback target refresh and deterministic target reads.
- replay model calls: 0.
- site/task-specific code added: no.

## Change boundary

The diagnostic is emitted with `EvidenceCollector.value_fact` only when a real `targetIdentity` exists and the
corresponding `refresh`, `state`, or `value` read fails. Known reasons are mapped to a fixed allowlist; every other
exception becomes `unavailable`. Raw exception text, page content, selector data, and backend node IDs are absent.
Actions without a captured target identity do not call target refresh and do not emit this fact.

This fact is observational metadata. The natural compiler continues to recognize only its existing effect facts and
does not use `target_observation_diagnostic` for completion, postconditions, or coverage.

## Focused evidence

`/private/tmp/bat-target-observation-diagnostic-probe.py` exercised the production collector in memory and injected
one produced diagnostic fact into a copy of the real
`work/natural-task-validation/5c333a80-53e0-45bd-9755-ae5560ed7608/source-result.json` request.
The source artifact was not modified.

- Known refresh failure produced `{actionRef: a-0008, stage: refresh, reason: target_refresh_not_unique}`.
- Its fact id and source reference digest both matched the canonical value digest
  `109620bae9abc4568a4d2b672bfe2615687ace68c3ba3b0842ebbe5b50971534`.
- An unknown exception containing `DO_NOT_LEAK_RAW_EXCEPTION_TEXT` produced reason `unavailable`; the marker was absent
  from the serialized facts.
- State and value failures produced the fixed reasons `target_state_unavailable` and `target_value_unavailable`.
- A missing target identity produced zero diagnostic facts and zero refresh calls.
- A successful refresh/state read produced `target_state` and zero diagnostic facts.
- Before and after diagnostic injection, a8 remained `not_compilable`, had no segment, and retained
  `visible_overlays_change_not_completion_proof`.

The earlier real GitHub Sort probe currently succeeds: the same target remains connected and mapped, its state changes
from collapsed to expanded, and `refreshed_target_element` succeeds. Therefore the historical a8 omission is not
currently reproducible. This change repairs observability for the next failure; it does not claim to repair a8 behavior.

## Validation

```text
work/upstream-browser-hybrid/.venv/bin/python -m py_compile \
  vendor/workflow-use/workflows/workflow_use/hybrid/post_action_target.py \
  vendor/workflow-use/workflows/workflow_use/hybrid/capture.py

work/upstream-browser-hybrid/.venv/bin/ruff check \
  vendor/workflow-use/workflows/workflow_use/hybrid/post_action_target.py \
  vendor/workflow-use/workflows/workflow_use/hybrid/capture.py

BAT_REPO_ROOT=<checkout-root> work/upstream-browser-hybrid/.venv/bin/python \
  /private/tmp/bat-target-observation-diagnostic-probe.py
```

No Browser session or model/provider call is required by the focused in-memory validation.
