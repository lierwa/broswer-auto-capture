"""Owned lab only: count the original scanner lifecycle; never persist its values."""
import asyncio
import json
import os
from pathlib import Path

SOURCE = """(() => {
  const state=globalThis.__ownedChallenge={started:0,finished:0,failed:0,status:'pending',signals:{}};
  addEventListener('crowdsec-challenge-status',event=>{
    const s=event.detail?.status;state.status=['success','ok','fail','failed','error','rejected'].includes(s)?s:'other';
  });
  Object.defineProperty(globalThis,'CrowdsecFingerprintScanner',{configurable:true,set(value){
    Object.defineProperty(globalThis,'CrowdsecFingerprintScanner',{value,writable:true,configurable:true});
    const collect=value.prototype.collectSignal;
    const names={'$':'mediaDevices',K:'worker',z:'highEntropy',ue:'keyboard',U:'webgpu',re:'canvas',de:'ai'};
    value.prototype.collectSignal=async function(fn){
      const name=names[fn.name];if(name)state.signals[name]='pending';
      try{const result=await collect.call(this,fn);if(name)state.signals[name]='finished';return result;}
      catch(error){if(name)state.signals[name]='failed';throw error;}
    };
    const original=value.prototype.collectFingerprint;
    value.prototype.collectFingerprint=async function(...args){
      state.started++;try{const result=await original.apply(this,args);state.finished++;return result;}
      catch(error){state.failed++;throw error;}
    };
  }});
})();"""

SNAPSHOT = """() => ({probe:globalThis.__ownedChallenge,
  challenge:!!document.getElementById('challenge-status-text'), business:!!document.querySelector('a[href*="/document/"]'),
  scanner:typeof globalThis.CrowdsecFingerprintScanner, ready:document.readyState,
  visibility:document.visibilityState, focused:document.hasFocus()})"""


def instrument(runner):
    path = Path(os.environ['BAT_CHALLENGE_DIAGNOSTIC_PATH']).resolve()
    if not path.is_relative_to(Path.cwd().resolve() / 'work/antibot-service'):
        raise ValueError('owned_challenge_diagnostic_path_required')
    start, execute = runner.start, runner.execute

    async def started(self, raw):
        result = await start(self, raw)
        session = await self.browser.get_or_create_cdp_session()
        await session.cdp_client.send.Page.addScriptToEvaluateOnNewDocument(
            params={'source': SOURCE}, session_id=session.session_id)
        return result

    async def capture(self):
        try:
            async with asyncio.timeout(3):
                page = await self.browser.get_current_page()
                value = json.loads(await page.evaluate(SNAPSHOT))
            path.write_text(json.dumps(value), encoding='utf-8')
        except Exception:
            pass  # 诊断失败不能替换实际业务失败，不尝试恢复/重发动作。

    async def executed(self, raw, *, action_ref=None):
        try:
            return await execute(self, raw, action_ref=action_ref)
        except Exception:
            await capture(self)
            raise

    runner.start, runner.execute = started, executed
