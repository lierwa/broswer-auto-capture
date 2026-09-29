"""One in-flight fd3 checkpoint, released only by its matching durable-save ACK."""
import asyncio
import hashlib
from typing import Literal
from uuid import UUID

from pydantic import Field
from workflow_use.hybrid.evidence import Contract


class CompilationAck(Contract):
    id: UUID
    type: Literal['hybrid_compilation_ack']
    authorRequestId: UUID
    sequence: int = Field(ge=1, le=202)
    digest: str = Field(pattern=r'^[a-f0-9]{64}$')
    accepted: bool


def confirmation_budget(compilation):
    # WHY：与宿主相同：只计算真实存在的示例，每个有 1000ms 沙箱预算。
    calls = sum(len(item['draft']['examples']) for item in compilation['segments']
                if item['kind'] == 'function')
    return 10 + calls


class CompilationControl:
    def __init__(self, identity, publish):
        self.identity, self.publish = str(identity), publish
        self.sequence, self.pending, self.last = 0, None, None

    async def exchange(self, payload, compilation):
        if self.pending is not None:
            raise ValueError('hybrid_compilation_ack_conflict')
        if len(payload.encode('utf-8')) > 8_000_000 or self.sequence >= 202:
            raise ValueError('hybrid_compilation_payload_limit')
        self.sequence += 1
        fingerprint = hashlib.sha256(payload.encode('utf-8')).hexdigest()
        future = asyncio.get_running_loop().create_future()
        self.pending = (self.sequence, fingerprint, future)
        try:
            self.publish({'id': self.identity, 'event': 'authoring_compilation',
                          'sequence': self.sequence, 'digest': fingerprint, 'payload': payload})
            try:
                accepted = await asyncio.wait_for(future, timeout=confirmation_budget(compilation))
            except TimeoutError:
                raise ValueError('hybrid_compilation_ack_timeout') from None
            if not accepted:
                raise ValueError('hybrid_compilation_host_rejected')
        finally:
            self.pending = None

    def acknowledge(self, ack):
        identity = (str(ack.authorRequestId), ack.sequence, ack.digest, ack.accepted)
        if str(ack.authorRequestId) != self.identity:
            raise ValueError('hybrid_compilation_ack_owner_mismatch')
        if identity == self.last:
            return {'accepted': True}
        if self.pending is None or (ack.sequence, ack.digest) != self.pending[:2]:
            raise ValueError('hybrid_compilation_ack_conflict')
        future = self.pending[2]
        if future.done():
            raise ValueError('hybrid_compilation_ack_conflict')
        self.last = identity
        future.set_result(ack.accepted)
        return {'accepted': True}

    def cancel(self):
        if self.pending is not None:
            self.pending[2].cancel()
