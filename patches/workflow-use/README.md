# workflow-use local patches

These patches are maintained as upstream-shaped changes. They can be applied to
an unmodified workflow-use checkout and later submitted to the upstream project
without copying B-A-T integration code into workflow-use.

For B-A-T development, build the ignored local runner from the pinned upstream
commit, apply both patches, install the frozen lock, and run the focused upstream
checks with:

```sh
npm run upstream:setup
```

The command is idempotent and refuses to overwrite an unmanaged directory. It
installs under `work/upstream-browser-runner/`, verifies the pinned Python and
package versions, verifies both patch hashes and reverse applicability, and
leaves the patch files themselves as the only upstream changes tracked by B-A-T.

## `0001-escape-workflow-prompt-variable-placeholders.patch`

- Upstream repository: <https://github.com/browser-use/workflow-use>
- Base commit: `5d2d19fe8835cc86f1bf3e04302a5000d590f249`
- Package version: `0.2.11`
- Scope: the LLM-based history-to-workflow generation prompt and one offline
  regression test.
- Cause: `HealingService.create_workflow_definition()` renders the prompt with
  `str.format(goal=..., actions=...)`. Two prose examples contained an
  unescaped `{variable}`, which was interpreted as a missing format argument and
  raised `KeyError: 'variable'` before history processing or model invocation.

Apply from the root of an unmodified workflow-use checkout:

```sh
git apply --check /absolute/path/to/0001-escape-workflow-prompt-variable-placeholders.patch
git apply /absolute/path/to/0001-escape-workflow-prompt-variable-placeholders.patch
```

Run the focused regression test from `workflow-use/workflows`:

```sh
.venv/bin/python -m unittest discover \
  -s workflow_use/healing/tests \
  -p 'test_workflow_creation_prompt.py' \
  -v
```

Reverse the local patch when required:

```sh
git apply -R /absolute/path/to/0001-escape-workflow-prompt-variable-placeholders.patch
```

The test performs no browser, network, filesystem mutation, or model call. When
rebasing to another upstream revision, run `git apply --check` and the focused
test before accepting the new base. Keep the upstream AGPL-3.0 license and source
notices with any distributed patched copy.

## `0002-dispatch-page-extraction-steps.patch`

- Base commit: `5d2d19fe8835cc86f1bf3e04302a5000d590f249`, after applying patch `0001`.
- Scope: `SemanticWorkflowExecutor` dispatch and one isolated async regression
  test.
- Cause: generation emits `extract_page_content`, the schema accepts it as
  `PageExtractionStep`, but `execute_step()` only dispatched `ExtractStep` and
  raised `Unsupported step type` during `run_with_no_ai()`.
- Behavior: normalize `PageExtractionStep.goal` into the existing
  `ExtractStep.extractionGoal` implementation while preserving shared metadata.

Apply patches in numeric order. Run the second focused test from
`workflow-use/workflows` with a writable browser-use config directory:

```sh
BROWSER_USE_CONFIG_DIR=/tmp/workflow-use-test-config \
  .venv/bin/python -m unittest discover \
  -s tests \
  -p 'test_semantic_executor_page_extraction.py' \
  -v
```

This test constructs no Browser and makes no network or model call. Importing the
upstream executor currently initializes browser-use configuration, which is why
the command supplies a writable config directory.
