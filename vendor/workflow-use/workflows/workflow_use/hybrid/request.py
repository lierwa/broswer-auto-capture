"""Authority and control inputs. Request digests cover their full normalized projections."""
from typing import Literal

from pydantic import Field, JsonValue, model_validator

from .evidence import Contract, EvidenceRef, NormalizedTrace, digest


class RequirementClause(Contract):
    id: str = Field(min_length=1)
    kind: Literal['input', 'selection', 'constraint', 'output', 'completion']
    expression: JsonValue


class Requirement(Contract):
    id: str
    version: int = Field(gt=0)
    digest: str
    clauses: list[RequirementClause] = Field(min_length=1)


class Plan(Contract):
    id: str
    version: int = Field(gt=0)
    digest: str
    stepId: str
    inputSchemaDigest: str
    outputSchemaDigest: str
    callMode: Literal['once', 'each', 'batch']


class SelectionIntent(Contract):
    id: str
    clauseRefs: list[str] = Field(min_length=1)
    actionRefs: list[str]
    strategy: Literal['ordinal', 'title', 'locator']
    # 目标描述是被确认的选择意图，不能携带历史 index 或完整节点/边。
    target: dict[str, JsonValue]


class BranchIntent(Contract):
    id: str
    clauseRefs: list[str] = Field(min_length=1)
    predicateSource: dict[str, JsonValue]
    predicate: dict[str, JsonValue]
    outcomes: dict[str, str]


class LoopIntent(Contract):
    id: str
    clauseRefs: list[str] = Field(min_length=1)
    bodyRef: str
    stableItemKey: dict[str, JsonValue] | None = None
    maxIterations: int = Field(gt=0, le=10000)
    accumulator: dict[str, JsonValue]
    continuePredicate: dict[str, JsonValue]
    stopOutcomes: list[Literal['complete', 'exhausted', 'blocked', 'failed']] = Field(min_length=1)


class InvokeIntent(Contract):
    id: str
    clauseRefs: list[str] = Field(min_length=1)
    chainId: str
    chainVersion: int = Field(gt=0)
    mode: Literal['once', 'each', 'batch']
    inputBindings: list[dict[str, JsonValue]]
    outputBindings: list[dict[str, JsonValue]]
    onItemFailure: Literal['stop', 'continue', 'pause']


class PlanControlContract(Contract):
    selections: list[SelectionIntent]
    branches: list[BranchIntent]
    loops: list[LoopIntent]
    invokes: list[InvokeIntent]


class ControlIntentAnnotation(Contract):
    kind: Literal['control_intent']
    clauseRefs: list[str] = Field(min_length=1)
    intent: SelectionIntent | BranchIntent | LoopIntent | InvokeIntent
    confirmedBy: Literal['user']


class SemanticOperationAnnotation(Contract):
    kind: Literal['semantic_operation']
    segmentEvidenceRefs: list[EvidenceRef] = Field(min_length=1)
    clauseRefs: list[str] = Field(min_length=1)
    purpose: Literal['classify', 'extract_semantics', 'summarize', 'rank_candidates', 'semantic_dedupe']
    candidateIds: list[str] | None = Field(default=None, max_length=300)
    inputFieldRefs: list[str] = Field(min_length=1, max_length=100)
    proposedOutputSchema: dict[str, JsonValue]


class CompilationRequest(Contract):
    compilerVersion: Literal['bat-hybrid/1']
    actionRegistryVersion: str
    requirement: Requirement
    plan: Plan
    control: PlanControlContract
    runtimeInputSchema: dict[str, JsonValue]
    trace: NormalizedTrace
    acceptedAnnotations: list[ControlIntentAnnotation | SemanticOperationAnnotation]

    @model_validator(mode='after')
    def verify_sources(self):
        for document in (self.requirement, self.plan):
            if document.digest != digest(document.model_dump(exclude={'digest'})):
                raise ValueError('authority_digest_mismatch')
        if self.plan.inputSchemaDigest != digest(self.runtimeInputSchema):
            raise ValueError('input_schema_digest_mismatch')
        clauses = {clause.id for clause in self.requirement.clauses}
        if len(clauses) != len(self.requirement.clauses):
            raise ValueError('duplicate_clause')
        intents = [*self.control.selections, *self.control.branches, *self.control.loops, *self.control.invokes]
        ids = set()
        action_ids = {action.id for action in self.trace.actions}
        for clause in self.requirement.clauses:
            expression = clause.expression
            if isinstance(expression, dict) and 'actionRefs' in expression:
                refs = expression['actionRefs']
                if refs is not None and (not isinstance(refs, list) or not refs
                                        or any(not isinstance(item, str) or item not in action_ids for item in refs)
                                        or len(set(refs)) != len(refs)):
                    raise ValueError('invalid_clause_action_refs')
        for item in intents + self.acceptedAnnotations:
            if not set(item.clauseRefs) <= clauses:
                raise ValueError('unknown_clause_ref')
            if isinstance(item, SelectionIntent) and not set(item.actionRefs) <= action_ids:
                raise ValueError('unknown_selection_action')
            if isinstance(item, ControlIntentAnnotation):
                if not set(item.intent.clauseRefs) <= set(item.clauseRefs):
                    raise ValueError('annotation_source_mismatch')
                if isinstance(item.intent, SelectionIntent) and not set(item.intent.actionRefs) <= action_ids:
                    raise ValueError('unknown_selection_action')
            if isinstance(item, SemanticOperationAnnotation):
                known = {(action.resultRef.ref, action.resultRef.digest) for action in self.trace.actions if action.resultRef}
                if any((reference.ref, reference.digest) not in known for reference in item.segmentEvidenceRefs):
                    raise ValueError('unknown_annotation_evidence')
                if not set(item.inputFieldRefs) <= action_ids:
                    raise ValueError('unknown_annotation_input')
        for intent in intents:
            if intent.id in ids:
                raise ValueError('duplicate_control_intent')
            ids.add(intent.id)
        return self


class NaturalRequirement(Contract):
    id: str = Field(min_length=1)
    version: int = Field(gt=0)
    text: str = Field(min_length=1, max_length=100000)
    taskText: str = Field(min_length=1, max_length=100000)
    sourceDigest: str = Field(pattern=r'^[a-f0-9]{64}$')
    digest: str = Field(pattern=r'^[a-f0-9]{64}$')

    @model_validator(mode='after')
    def verify_digest(self):
        if self.digest != digest(self.model_dump(exclude={'digest'})):
            raise ValueError('natural_requirement_digest_mismatch')
        return self


class NaturalPlan(Contract):
    id: str = Field(min_length=1)
    version: int = Field(gt=0)
    sourceDigest: str = Field(pattern=r'^[a-f0-9]{64}$')
    digest: str = Field(pattern=r'^[a-f0-9]{64}$')
    stepId: str = Field(min_length=1)
    inputSchemaDigest: str = Field(pattern=r'^[a-f0-9]{64}$')
    outputSchemaDigest: str = Field(pattern=r'^[a-f0-9]{64}$')
    callMode: Literal['once', 'each', 'batch']

    @model_validator(mode='after')
    def verify_digest(self):
        if self.digest != digest(self.model_dump(exclude={'digest'})):
            raise ValueError('natural_plan_digest_mismatch')
        return self


class NaturalCompilationRequest(Contract):
    compilerVersion: Literal['bat-hybrid/2']
    actionRegistryVersion: str = Field(min_length=1)
    requirement: NaturalRequirement
    plan: NaturalPlan
    runtimeInputSchema: dict[str, JsonValue]
    trace: NormalizedTrace

    @model_validator(mode='after')
    def verify_schema_digest(self):
        if self.plan.inputSchemaDigest != digest(self.runtimeInputSchema):
            raise ValueError('input_schema_digest_mismatch')
        return self


def effective_control(request):
    control = request.control.model_copy(deep=True)
    destinations = {SelectionIntent: control.selections, BranchIntent: control.branches,
                    LoopIntent: control.loops, InvokeIntent: control.invokes}
    ids = {intent.id for items in destinations.values() for intent in items}
    for annotation in request.acceptedAnnotations:
        if isinstance(annotation, ControlIntentAnnotation):
            if annotation.intent.id in ids:
                raise ValueError('duplicate_control_annotation')
            destinations[type(annotation.intent)].append(annotation.intent)
            ids.add(annotation.intent.id)
    return control
