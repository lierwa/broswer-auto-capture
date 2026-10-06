"""Only the new automatic admission gate; old popup/settings W01-W09 are not replayed."""
import asyncio,importlib.util,json,os,sys
from pathlib import Path
from uuid import uuid4
ROOT=Path.cwd();OUT=ROOT/os.environ.get('BAT_ACCOUNT_EVIDENCE_DIR','work/account-unified-20261003/native-login-reuse')
OUT.mkdir(parents=True,exist_ok=True)
async def main():
    spec=importlib.util.spec_from_file_location('owned_daily_setup',ROOT/'apps/api/tests/account-borrow-windows.acceptance.py')
    gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)
    gate.OUTPUT=OUT/str(uuid4());gate.OUTPUT.mkdir()
    async def probe(window,_profile,_client):
        endpoint=window.cdp_url
        await window.end(window.owner_id)
        process=await asyncio.create_subprocess_exec('node','--import','tsx','apps/api/tests/account-unified-native.acceptance.ts',cwd=ROOT,
            stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE,
            env={**os.environ,'BAT_RUN_ACCOUNT_UNIFIED':'1'})
        stdout,stderr=await process.communicate(json.dumps({'endpoint':endpoint,'attemptPath':str(gate.OUTPUT)}).encode())
        (OUT/'node.log').write_bytes(stdout+stderr)
        if process.returncode:raise ValueError('account_new_native_admission_failed')
    await gate.daily(probe)
if __name__=='__main__':
    if os.environ.get('BAT_RUN_ACCOUNT_UNIFIED')!='1':raise ValueError('explicit_owned_windows_gate_required')
    asyncio.run(main())
