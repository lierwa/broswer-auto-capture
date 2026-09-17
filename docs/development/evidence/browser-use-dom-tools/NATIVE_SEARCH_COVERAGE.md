# Native search_page coverage evidence

Product Alignment:
- natural-language task: compile a captured browser-use exploration that used native `search_page` to locate page text before later deterministic actions.
- reusable chain boundary: `search_page` remains an evidence-only, read-only agent exploration action and creates no executable segment or output field.
- runtime inputs: none added; the original parameterized chain inputs remain authoritative.
- dynamic task outputs: none added; final output still requires `verified_natural_read` or an explicit verified summary.
- generic platform capability used: independent action-coverage validation plus the existing read-only runtime-scope boundary check.
- replay model calls: 0.
- site/task-specific code added: no.

Reuse Assessment:
- capability: prove that one successful native page-text lookup is safe to exclude from replay while preserving its evidence and runtime page continuity.
- existing implementation in repository: `find_elements` already uses evidence-only lookup coverage; `advanceReadOnlyBoundary` already verifies successful read actions across same-tab, unchanged full URL-digest observations.
- mature candidates and pinned versions: browser-use 0.13.8 native `search_page` in `tools/service.py`.
- selected implementation: reuse native `search_page`; add only B-A-T coverage classification and consumer-side runtime-scope admission.
- reused public surface: registered `search_page` action schema/result and the existing normalized action, observation, evidence reference, registry validation, and runtime-scope APIs.
- B-A-T-owned adapter and remaining gap: derive one exact coverage row from successful action plus pre/post evidence, then recompute it independently during coverage validation; no executor is added.
- license/runtime/platform fit: same pinned browser-use runtime already selected by the hybrid runner; no dependency or platform change.
- browser/runtime/state ownership conflicts: none; classification is offline and replay keeps the existing single browser owner.
- replay model calls: 0.
- rejected candidates and evidence: compiling `search_page` as an output/read segment is rejected because upstream only returns page-text matches for agent exploration and supplies no verified structured field contract; treating every successful read as internal is rejected because it would bypass per-action evidence rules.
- focused validation: real `a-0024` baseline yields `natural_action_not_admitted`; post-change helper plus independent coverage validation must pass only for matching result/pre/post refs with one equal full `url_digest`, and reject missing post, cross-tab, changed digest, failed status, or tampered refs.

Upstream source evidence:
- `browser_use/tools/service.py:1297-1334` runs `_build_search_page_js` through CDP and returns formatted matches without a model call, navigation, scrolling, or page mutation.
- `_SEARCH_PAGE_JS_BODY` walks text nodes, computes contexts and element paths, and returns match metadata only.

Baseline acceptance:
- `a-0024` from `source-result.json`, validated against the live registered `search_page` schema, returns only `unsupported_capability:natural_action_not_admitted` before this change.

Focused validation after change:
- Real `a-0024` plus `o-0045`/`o-0046` derives `native_text_lookup_observation/v1`; independent `validate_coverage` accepts the exact derived row.
- Missing post observation, different tab, changed URL digest, failed status, and tampered evidence refs each produce `incomplete_action_coverage:invalid_exclusion`.
- `python -m py_compile` passed for the two changed Python files.
- Existing venv Ruff passed for the two changed Python files.
- `npm run check --workspace @browser-capture/api` passed.
- The original source trace flags, registry digest, and source artifact were not changed; full-source compilation is intentionally not claimed.
