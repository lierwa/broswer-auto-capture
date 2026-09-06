param([switch]$Narrow)
$ErrorActionPreference = 'Stop'
$SessionId = $null
function Assert-Page([string]$Expression, [string]$Name) {
  $deadline = (Get-Date).AddSeconds(8)
  do {
    $result = (bsk evaluate $Expression --session $SessionId | Out-String).Trim()
    if ($result -eq 'true') { Write-Output "PASS $Name"; return }
    Start-Sleep -Milliseconds 200
  } while ((Get-Date) -lt $deadline)
  throw "$Name failed: $result"
}
function Activate([string]$Role, [string]$Name) {
  $snapshot = bsk snapshot --session $SessionId | Out-String
  $pattern = '(?m)^\s*(@e\d+)\s+' + [regex]::Escape($Role) + ' "' + [regex]::Escape($Name) + '"'
  $match = [regex]::Match($snapshot, $pattern)
  if (-not $match.Success) { throw "Missing $Name" }
  bsk press Enter --ref $match.Groups[1].Value --session $SessionId | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Action failed: $Name" }
}
function Start-Case([string]$Mode) {
  Invoke-RestMethod http://127.0.0.1:4177/start -Method Post -ContentType application/json -Body ('"' + $Mode + '"') | Out-Null
}
try {
  $SessionId = (bsk session start --json | ConvertFrom-Json).session_id
  bsk navigate http://127.0.0.1:4176 --session $SessionId | Out-Null
  bsk observe --session $SessionId | Out-Null
  Activate 'tab' '来源调研'
  if ($Narrow) {
    bsk emulate --session $SessionId --width 390 --height 844 --dpr 1 --mobile | Out-Null
    bsk observe --session $SessionId | Out-Null
    Activate 'button' '收起任务列表'
    Assert-Page 'innerWidth === 390 && document.querySelector("[aria-label=浏览器状态]")?.getBoundingClientRect().right <= innerWidth && document.documentElement.scrollWidth <= innerWidth && !document.querySelector(".task-nav-drawer")' '390px-status-fits'
    bsk screenshot --session $SessionId --out D:/work/browser-capture-tool/work/f2-ui-390.png | Out-Null
    return
  }
  Assert-Page 'document.querySelector("[aria-label=浏览器状态]")?.innerText.includes("尚未启动") === true' 'idle'
  Start-Case 'waiting'
  Assert-Page 'document.querySelector("[aria-label=浏览器状态]")?.innerText.includes("正在工作") === true' 'running'
  Activate 'button' '停止浏览器操作'
  Assert-Page 'document.querySelector("[aria-label=浏览器状态]")?.innerText.includes("已停止") === true' 'cancelled'
  Start-Case 'manual'
  Assert-Page 'document.querySelector("[aria-label=浏览器状态]")?.innerText.includes("页面要求人工处理") === true' 'manual-required'
  bsk reload --session $SessionId | Out-Null
  bsk observe --session $SessionId | Out-Null
  Activate 'tab' '来源调研'
  Assert-Page 'document.querySelector("[aria-label=浏览器状态]")?.innerText.includes("页面要求人工处理") === true' 'reload-retains-manual'
  Start-Case 'failed'
  Assert-Page 'document.querySelector("[aria-label=浏览器状态]")?.innerText.includes("操作失败") === true' 'failed'
  Start-Case 'cleanup'
  Assert-Page 'document.querySelector("[aria-label=浏览器状态]")?.innerText.includes("清理所属会话") === true' 'cleanup-required'
  Invoke-RestMethod http://127.0.0.1:4177/allow-cleanup -Method Post -ContentType application/json -Body '{}' | Out-Null
  Activate 'button' '清理所属会话'
  Assert-Page 'document.querySelector("[aria-label=浏览器状态]")?.innerText.includes("上次操作被中断") === true && !document.querySelector("[aria-label=浏览器状态]")?.innerText.includes("清理所属会话")' 'cleanup-is-not-success'
  Start-Case 'normal'
  Assert-Page 'document.querySelector("[aria-label=浏览器状态]")?.innerText.includes("操作已完成") === true' 'completed'
  Assert-Page 'document.documentElement.scrollWidth <= innerWidth' 'no-horizontal-overflow'
} catch {
  if ($SessionId) { bsk observe --session $SessionId; bsk screenshot --session $SessionId --out D:/work/browser-capture-tool/work/f2-ui-failure.png | Out-Null }
  throw
} finally { if ($SessionId) { bsk session stop $SessionId | Out-Null } }
