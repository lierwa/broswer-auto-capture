// WHY：上游异步错误可能包含页面或凭据；控制错误仍由原 CDP response 传回调用方。
export function logUnhandledError(_error: unknown): void {
  console.error('daily_chrome_relay_async_failed');
}
