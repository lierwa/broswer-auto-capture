"""Read the original document through native CDP without switching browser focus."""
from .evidence import digest
from .fixed_control_dispatch import document_identity
from .observation_scope import live_document_sample


async def capture_entry_lifetime(collector, after):
    before = next(item for item in collector.observations if item.id == collector.pending['pre'])
    if before.tabId == after.tabId or not any(fact.kind == 'input_entry_target' for fact in before.facts):
        return
    try:
        sample = await live_document_sample(collector.browser, before.tabId)
        if sample['stable'] and sample['documentDigest']:
            after.facts.append(collector.value_fact('entry_source_document', {
                'targetId': sample['targetId'], 'documentDigest': sample['documentDigest'],
                'urlDigest': digest(sample['url'])}))
    except Exception:
        # WHY：原生探索继续；缺少来源存活证据时只阻止发布，不猜测或重放浏览器动作。
        pass


def entry_document_survives(before, after):
    if after is None:
        return True  # Historical sources retain their original contract.
    original, current = document_identity(before), document_identity(after)
    if before.tabId == after.tabId:
        return before.url == after.url and not (original and current and original != current)
    facts = [fact for fact in after.facts if fact.kind == 'entry_source_document']
    expected = {**original, 'urlDigest': digest(before.url)} if original else None
    return len(facts) == 1 and expected is not None and facts[0].value == expected
