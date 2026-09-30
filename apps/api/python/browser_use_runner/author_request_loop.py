"""One active native author request plus its explicit human continuation control."""
import asyncio
import json
import sys

from browser_use_runner.author_transport import write_author_result


class AuthorRequestLoop:
    def __init__(self, runner, channel, diagnostics, safe_error):
        self.runner, self.channel, self.diagnostics = runner, channel, diagnostics
        self.safe_error, self.author = safe_error, None

    def write(self, request, response):
        if request.get('type') == 'hybrid_author':
            write_author_result(self.channel, request.get('id'), response, self.diagnostics)
        else:
            self.channel.write(json.dumps(response, ensure_ascii=False, allow_nan=False) + '\n')

    async def respond(self, request):
        try:
            result = await self.runner.handle(request)
            response = {'id': request.get('id'), 'ok': True, 'result': result}
        except Exception as error:
            code = self.safe_error(error)
            response = {'id': request.get('id'), 'ok': False, 'code': 'hybrid_runner_failed',
                        'reason': type(error).__name__ + (':' + code if code else '')}
        self.write(request, response)
        # WHY：先写 ACK 再唤醒 Agent；否则下一次 human_wait 可抢先覆盖宿主仍待完成的旧等待。
        if response['ok'] and request.get('type') == 'hybrid_author_resume':
            self.runner.human_wait.release(request['waitpointId'])

    async def cancel_author(self):
        if self.author is None:
            return
        self.author.cancel()
        try:
            await self.author
        except asyncio.CancelledError:
            pass
        finally:
            self.author = None

    async def release_allowed(self, request):
        if request.get('type') != 'hybrid_release':
            return True
        try:
            self.runner.validate_release(request)
        except Exception:
            # WHY：先校验 parent，再取消作者；错 owner/损坏 envelope 不获得本任务停止权限。
            await self.respond(request)
            return False
        return True

    async def run(self):
        try:
            while line := await asyncio.to_thread(sys.stdin.readline):
                request = json.loads(line)
                active = self.author is not None and not self.author.done()
                if active and not await self.release_allowed(request):
                    continue
                if active and request.get('type') in ('close', 'hybrid_release'):
                    await self.cancel_author()
                elif active and request.get('type') not in ('hybrid_author_resume', 'hybrid_compilation_ack'):
                    self.write(request, {'id': request.get('id'), 'ok': False, 'code': 'hybrid_runner_failed',
                        'reason': 'ValueError:hybrid_author_request_in_progress'})
                    continue
                if request.get('type') == 'hybrid_author':
                    self.author = asyncio.create_task(self.respond(request))
                else:
                    await self.respond(request)
                if request.get('type') == 'close':
                    break
        finally:
            await self.cancel_author()
