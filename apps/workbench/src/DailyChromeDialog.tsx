import { Button, Dialog } from "@radix-ui/themes"

/** WHY：日常 Chrome 由用户拥有；设置只解释原生连接，不能另开私有 Profile 或代替用户关闭浏览器。 */
export function DailyChromeDialog({ open, onOpenChange }: {
  open: boolean
  onOpenChange(open: boolean): void
}) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Content maxWidth="520px">
      <Dialog.Title>使用日常 Chrome</Dialog.Title>
      <Dialog.Description>
        准备任务、样本验证和正式运行都连接你平时使用的 Chrome，沿用其中的登录状态。
      </Dialog.Description>
      <p>保持 Chrome 打开。在地址栏进入 <code>chrome://inspect/#remote-debugging</code>，
        开启原生远程调试，并在任务连接时确认 Chrome 的允许提示。</p>
      <p>任务会新建自己的窗口，只操作和清理所属标签页；不会关闭你的 Chrome、复制账号数据，
        也不会在连接失败时换用专用浏览器。</p>
      <Dialog.Close><Button variant="soft" color="gray">返回工作台</Button></Dialog.Close>
    </Dialog.Content>
  </Dialog.Root>
}
