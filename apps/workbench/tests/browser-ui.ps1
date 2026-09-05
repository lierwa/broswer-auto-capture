param([Parameter(Mandatory)][ValidatePattern('^[a-z]{4}$')][string]$SessionId, [switch]$VisualOnly)
# 兼容旧入口：多任务 API 已替代无 taskId 的单会话接口。本回归不再发送真实模型轮次。
& "$PSScriptRoot/browser-layout.ps1" -SessionId $SessionId
