# Post-action target refresh

Product Alignment:
- natural-language task: capture the real state of a control after one native browser action.
- reusable chain boundary: refresh one callback-owned target from the action's coherent post-action native snapshot.
- runtime inputs: the pre-action callback target's XPath, tag, stable native attributes, tab and full URL; plus a
  callback-proven unique `tag[aria-label="..."]` selector when one exists.
- dynamic task outputs: bounded target value/state facts from the current connected element.
- generic platform capability used: browser-use callback selector maps, Page/Element APIs, and the existing coherent post-snapshot retry.
- replay model calls: 0.
- site/task-specific code added: no.

Reuse Assessment:
- capability: re-identify a control replaced by a client render before reading its post-action state.
- existing implementation in repository: callback-owned selector maps, `element_from_backend`, `read_target_state`, and `capture_consistent_post_snapshot`.
- mature candidates and pinned versions: browser-use 0.13.8 native DOM snapshot and Element APIs; workflow-use pinned fork.
- selected implementation: a small adapter over the existing post summary and Element API.
- reused public surface: `Browser.get_browser_state_summary`, callback `selector_map`, `Page.get_element`, and `Element.evaluate`.
- B-A-T-owned adapter and remaining gap: keep the pre target identity in memory, admit a semantic CSS selector only
  when it uniquely resolves to the callback backend, and require one unique same-page post match; absence or ambiguity
  produces no target fact.
- license/runtime/platform fit: unchanged pinned browser-use/workflow-use runtime; no dependency or distribution change.
- browser/runtime/state ownership conflicts: Browser remains the only session owner; the adapter neither retries the action nor stores browser state.
- replay model calls: 0.
- rejected candidates and evidence: fixed waits cannot repair a detached Element; fuzzy/LLM lookup can bind a different
  control; reusing the old handle returned stale state on GitHub; exact XPath alone failed when React inserted a wrapper.
- focused validation: disconnected/zero/two/tag/tab/URL counterexamples, Python compile/Ruff, and one real GitHub capture then ordinary-capability replay.

The pre-action callback snapshot remains authoritative for the action target. Only its raw in-memory XPath, tag, and the
values present among `type`, `role`, `id`, `name`, `data-testid`, `aria-label`, and `title` are retained. A nonempty,
control-free `aria-label` may produce a CSS candidate only when the native Page query has exactly one result and its
backend is the callback node. That proven candidate is stored in the existing `queryCandidate` contract and compiles to
the existing CSS target. Other targets continue to use exact XPath. Post facts require the same tab and complete URL,
one corresponding main-document node in the same post summary, matching tag and semantic attributes, and a connected
fresh Element. Navigation or any missing, ambiguous, frame, shadow, identity-mismatched, or detached result omits target
value/state evidence while preserving other post facts and existing gaps.

## Evidence

- The first real GitHub a5 acceptance proved why exact XPath was insufficient. The old backend disconnected and the
  fresh button was expanded, but React changed the path from `.../div/div[3]/button` to
  `.../div/div[3]/div/button`; the strict refresh correctly emitted no target fact.
- After admitting the callback-proven CSS candidate, the next single Browser run captured pre state
  `{"disabled":false}` and post state `{"aria-expanded":true,"disabled":false}`. It emitted no `target_value` for the
  click. The compiler produced `button[aria-label="Filter by labels"]` with the matching `target_state` condition.
- The same source run could not continue into replay because browser-use had already closed its Browser connection.
  `Agent.run()` calls `Agent.close()` in
  `work/upstream-browser-hybrid/.venv/lib/python3.12/site-packages/browser_use/agent/service.py:2729`; with
  `keep_alive=False`, `Agent.close()` calls `browser_session.kill()` at lines 3984-3988. The observed uninitialized CDP
  client therefore came from the probe lifecycle, not target resolution.
- A separate Browser replay loaded the exact compiled target and condition from the saved source result, navigated to
  the compiled scope URL, and executed `OrdinaryCapability.execute_checked`. The action completed with actual state
  `{"aria-expanded":true,"disabled":false}` and closed the Browser in `finally`. The sanitized replay evidence is
  `/private/tmp/bat-github-a5-compiled-replay.json`.
- `/private/tmp/bat-post-action-target-counterexamples.json` records rejection of duplicate labels, wrong callback or
  post backend, tag mismatch, label mismatch, detached state/value, and invalid query candidates. Python compilation and
  Ruff passed for the changed Python files.
