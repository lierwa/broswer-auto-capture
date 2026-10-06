"""Typed runner transport contracts, shared by native authoring and replay."""
from typing import Annotated, Literal
from uuid import UUID
from pydantic import Field, JsonValue, TypeAdapter, model_validator
from workflow_use.hybrid.evidence import CompilationGap, Contract
from workflow_use.hybrid.read import ReadPaths, ReadSpec
from workflow_use.hybrid.author import AuthorInput
from workflow_use.hybrid.request import CompilationRequest, NaturalCompilationRequest
from workflow_use.hybrid.invokes import VerifiedChild
from browser_use_runner.profile_owner import RunnerOwnership
from browser_use_runner.compilation_control import CompilationAck


class AllowedSite(Contract):
    scheme: Literal['http', 'https']
    domain: str = Field(min_length=1, max_length=253)
    port: int | None = Field(default=None, ge=1, le=65535)
    includeSubdomains: bool


class ManagedWindowConfig(Contract):
    ownerId: UUID
    resume: bool = False
    releasedOwners: list[UUID] = Field(default_factory=list)


class ExistingBrowserConfig(ManagedWindowConfig):
    cdpUrl: str = Field(min_length=1, repr=False)


class StorageCookie(Contract):
    name: str
    value: str = Field(repr=False)
    domain: str
    path: str
    expires: float
    httpOnly: bool
    secure: bool
    sameSite: Literal['Strict', 'Lax', 'None']


class StorageEntry(Contract):
    name: str
    value: str = Field(repr=False)


class StorageOrigin(Contract):
    origin: str
    localStorage: list[StorageEntry]


class ExecutionStorage(Contract):
    cookies: list[StorageCookie]
    origins: list[StorageOrigin]


class StartConfig(Contract):
    headless: bool
    profilePath: str
    storageState: ExecutionStorage | None = Field(default=None, repr=False)
    allowedOrigins: list[str] = Field(min_length=1, max_length=32)
    allowedSites: list[AllowedSite] = Field(min_length=1, max_length=32)
    managedWindow: ManagedWindowConfig | None = None
    existingBrowser: ExistingBrowserConfig | None = None
    connectionOwnerId: UUID | None = None

    @model_validator(mode='after')
    def exclusive_window_owner(self):
        if self.storageState is not None and (self.existingBrowser is not None or self.managedWindow is None or self.managedWindow.resume):
            raise ValueError('hybrid_storage_state_requires_new_owned_profile')
        if self.managedWindow is not None and self.existingBrowser is not None:
            raise ValueError('hybrid_window_owner_modes_exclusive')
        if self.connectionOwnerId is not None and (self.existingBrowser is None or self.existingBrowser.resume):
            raise ValueError('hybrid_attached_window_connection_requires_new_operation')
        return self


class ProfileStartConfig(Contract):
    profilePath: str
    headless: bool = False
    ownerId: UUID


class StepCommand(Contract):
    name: Literal['browser.workflow-step']
    version: Literal[2]
    actionName: str
    args: dict[str, JsonValue]
    target: dict[str, JsonValue] | None
    # WHY：附加页面条件可为空；原生动作仍由 Tools.act 报告成功/失败。
    postconditions: list[dict[str, JsonValue]]


class ReadCommand(Contract):
    name: Literal['browser.read-fields']
    version: Literal[2]
    specification: ReadSpec
    scope: 'ReadScope | None' = None
    requiredPaths: ReadPaths = Field(default_factory=list)
    inherited: JsonValue = None


class TargetReadinessCommand(Contract):
    name: Literal['browser.target-readiness']
    version: Literal[1]
    actionName: Literal['click', 'input', 'dropdown_options', 'select_dropdown']
    target: dict[str, JsonValue]


class ReadScope(Contract):
    url: str = Field(min_length=1)
    urlDigest: str | None = Field(default=None, pattern=r'^[a-f0-9]{64}$')


COMMAND = TypeAdapter(StepCommand | ReadCommand | TargetReadinessCommand)


class Envelope(Contract):
    id: UUID


class StartRequest(Envelope):
    type: Literal['hybrid_start']
    config: StartConfig


class ProfileStartRequest(Envelope):
    type: Literal['profile_start']
    config: ProfileStartConfig


class ProfileOwnerRequest(Envelope):
    type: Literal['profile_owner']
    ownerId: UUID
    launcherPid: int = Field(gt=0)


class ProfileRecoverRequest(Envelope):
    type: Literal['profile_recover']
    profilePath: str
    ownerId: UUID
    leaseId: UUID
    runner: RunnerOwnership


class ExecuteRequest(Envelope):
    type: Literal['hybrid_execute']
    actionRef: str | None = Field(default=None, min_length=1, max_length=256)
    command: StepCommand | ReadCommand | TargetReadinessCommand


class ObserveRequest(Envelope):
    type: Literal['hybrid_observe']


class HandoffRequest(Envelope):
    type: Literal['hybrid_handoff']


class ManagedWindowRequest(Envelope):
    type: Literal['hybrid_managed_window']
    action: Literal['focus', 'inspect', 'page', 'end', 'verify_closed']
    profilePath: str
    ownerId: UUID
    leaseId: UUID
    browserMode: Literal['daily', 'dedicated-visible', 'dedicated-headless'] | None = None
    cdpUrl: str | None = Field(default=None, repr=False)
    legacyEndpointVerified: bool = False
    controllerReleased: bool = False


class AccountSessionRequest(Envelope):
    type: Literal['hybrid_account_session']
    action: Literal['open_page', 'check', 'observe', 'auth_read', 'auth_prepare', 'auth_write', 'auth_restore', 'auth_abandon', 'pick_marker', 'clear_marker']
    profilePath: str
    ownerId: UUID
    leaseId: UUID
    kind: Literal['daily', 'dedicated']
    cdpUrl: str | None = Field(default=None, repr=False)
    legacyEndpointVerified: bool = False
    platformId: str = Field(min_length=1, max_length=120)
    catalogVersion: str
    evidenceSha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    payload: JsonValue = Field(default=None, repr=False)


class CloseRequest(Envelope):
    type: Literal['close']


class ReleaseRequest(Envelope):
    type: Literal['hybrid_release']
    connectionOwnerId: UUID


class AuthorModel(Contract):
    model: str
    endpoint: str
    token: str = Field(repr=False)


class AuthorRequest(Envelope):
    type: Literal['hybrid_author']
    model: AuthorModel
    source: AuthorInput
    onlineCompilation: bool = False


class AuthorResumeRequest(Envelope):
    type: Literal['hybrid_author_resume']
    authorRequestId: UUID
    waitpointId: UUID


class CompileRequest(Envelope):
    type: Literal['hybrid_compile']
    request: CompilationRequest | NaturalCompilationRequest
    outputSchema: dict[str, JsonValue]
    verifiedChildren: list[VerifiedChild] = Field(default_factory=list, max_length=100)
    sourceGaps: list[CompilationGap] = Field(default_factory=list)


class AnnotateRequest(CompileRequest):
    type: Literal['hybrid_annotate']
    request: NaturalCompilationRequest
    model: AuthorModel


REQUEST = TypeAdapter(Annotated[StartRequest | ProfileStartRequest | ProfileOwnerRequest | ProfileRecoverRequest | ExecuteRequest | ObserveRequest | HandoffRequest | ManagedWindowRequest | AccountSessionRequest | CloseRequest | ReleaseRequest | AuthorRequest | AuthorResumeRequest | CompilationAck | CompileRequest | AnnotateRequest, Field(discriminator='type')])
