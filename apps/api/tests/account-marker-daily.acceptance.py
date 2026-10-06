"""Only the missing native Overlay borrow-event gate, original extension in an owned Chrome Profile."""
import asyncio, importlib.util,json,sys,threading
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from uuid import uuid4
ROOT=Path.cwd();sys.path.insert(0,str(ROOT/'apps/api/python'))
from browser_use_runner.account_borrow import borrow_window
from browser_use_runner.account_marker import pick
class Site(BaseHTTPRequestHandler):
    def log_message(self,*_args):pass
    def do_GET(self):
        self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers()
        self.wfile.write(b'<main><span id="owned-name">Owned daily marker</span></main>')
out=ROOT/'work/account-rebuild-20261003/marker-daily';out.mkdir(exist_ok=True)
proof={'passed':False,'personalProfileTouched':False,'modelCalls':0}
async def main():
    server=ThreadingHTTPServer(('127.0.0.1',0),Site);threading.Thread(target=server.serve_forever,daemon=True).start()
    async def probe(daily,_profile,_client):
        async with borrow_window(daily.profile_path,daily.owner_id,daily.owner_id,'daily') as b:
            await b.page.goto(f'http://127.0.0.1:{server.server_port}/')
            task=asyncio.create_task(pick(b,b.page.url));await asyncio.sleep(.5)
            for _ in range(12):
                await b.page.locator('#owned-name').click(timeout=5000)
                if task.done():break
                await asyncio.sleep(.25)
            result=await asyncio.wait_for(task,10)
            assert result['selector']=='[id="owned-name"]' and result['preview']=='Owned daily marker'
        assert (await daily.inspect(daily.owner_id))['active']
        proof.update(passed=True,nativeInspectEventThroughBorrowAlias=True,disconnectPreservesChrome=True)
    spec=importlib.util.spec_from_file_location('owned_gate',ROOT/'apps/api/tests/account-borrow-windows.acceptance.py')
    gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)
    gate.OUTPUT=out/str(uuid4());gate.OUTPUT.mkdir()
    try:await gate.daily(probe)
    finally:server.shutdown()
try:asyncio.run(main())
finally:(out/'result.json').write_text(json.dumps(proof,indent=2)+'\n')
