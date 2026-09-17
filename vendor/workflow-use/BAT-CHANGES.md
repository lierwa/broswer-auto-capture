# B-A-T fork changes

2026-09-16: pristine baseline imported. No upstream file modified; no 0001–0012 applied. UPSTREAM.json records the archive and every imported file digest. Runtime integration is gated by H2 reuse assessment.

## 2026-09-16 executor contract repair

- Modified `workflows/workflow_use/workflow/semantic_executor.py`: dispatch PageExtractionStep through the existing ExtractStep handler without losing metadata; reject unavailable ordinals and prevent selector/text fallbacks from changing the selected target. Positional clicks reuse the existing browser-use Element API and require one resolved element. No-position behavior is retained.
- Added `workflows/tests/test_executor_contract.py`: 7 focused tests, actual fork imports, in-memory Browser/Element ports, no real browser/model. Red reproduced unsupported extraction and first-item fallback; green passes.
- UPSTREAM.json remains the immutable 188-file import baseline. LOCAL-CHANGES.json records modified/added Python source digests separately. No historical patch stack applied; b-u and host runtime unchanged in this repair.

## 2026-09-16 hybrid compiler development (not frozen)

- Added `workflow_use/hybrid`: public-schema registry, history/observation capture, coverage, authority bindings, bounded semantic values, field reads, control compilation, canonical response. No driver, Agent loop, scheduler or checkpoint database.
- Reused `Tools.act`, public Page/Element reads, ElementFinder matching, BeautifulSoup and StepVerifier. StepVerifier has a declared-check extension requiring every check to pass; unsupported old permissive checks are not selected by hybrid.
- Added focused tests for source integrity, missing evidence, intent separation, bounded loops/LLM, capture, and an opt-in real local Browser fixture.
- Source verification uses original UPSTREAM.json plus LOCAL-CHANGES.json. Two original modules are modified; 186 original files retain baseline bytes.
- Added declared asynchronous completion via the frozen Tenacity 9.1.2 dependency. Only fact checks retry; browser side effects execute once. Pure source waits require bounded causal evidence and remain uniquely owned.
- Native extraction accepts the pinned public structured metadata or exact URL/query/result envelope, then requires equality with independent field reads. Object results require exactly one declared container.
- Source-backed clause loops, pure input branches, verified linear once child calls, typed output assembly, native authoring and v2 product artifacts are connected. Source normalization/annotation gaps are preserved; later-step/cleanup failure saves obtained sources without creating candidates.
- Real local Chrome: asynchronous two-field form sample/different-input/disabled branch; native structured extraction and changed-page field results; readonly recovery, changed-page rejection and cancellation. Provider responses in source tests are scripted, not H7 provider/business acceptance.
- H4/H5/H6 remain in development: complete scroll/cross-tab/nested control shapes, ordinary Markdown control confirmation remain open; H7 has not started.

- Added offline recompilation through the same current Tools registry, with exact source/schema/registry gates and no Agent, Browser or model. Formal failed-compilation retry reuses complete closed sources and preserves original audit.
- Bounded repeated field values use the existing reader; unchanged scalar specifications keep identical canonical serialization. Prior-output bindings require independently proved values and can name output clauses before source action IDs exist.
- Explicit changed completion captures this replay's declared pre-state before acting. Missing baseline prevents action; unchanged facts reject. Bounded waits use declared completion facts whether completion occurs before or after the action returns; unbounded waits retain the stricter unchanged-document rule. Real local asynchronous form with different titles passes both inputs, four commands and zero replay model calls each.
