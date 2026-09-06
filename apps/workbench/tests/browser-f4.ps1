$ErrorActionPreference = 'Stop'
$SessionId = $null
function Assert-Page([string]$Expression, [string]$Name) {
  $deadline = (Get-Date).AddSeconds(12)
  do {
    $result = (bsk --json evaluate $Expression --session $SessionId | Out-String | ConvertFrom-Json)
    if ($result.ok -and $result.value -eq $true) { Write-Output "PASS $Name"; return }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)
  bsk observe --session $SessionId | Write-Output
  throw "$Name failed"
}
function Activate([string]$Role, [string]$Name) {
  $snapshot = bsk snapshot --session $SessionId | Out-String
  $pattern = '(?m)^\s*(@e\d+)\s+' + [regex]::Escape($Role) + ' "' + [regex]::Escape($Name) + '"'
  $match = [regex]::Match($snapshot, $pattern)
  if (-not $match.Success) { Write-Output $snapshot; throw "Missing $Name" }
  bsk press Enter --ref $match.Groups[1].Value --session $SessionId | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Action failed: $Name" }
}
function Mode([string]$Value) { Invoke-RestMethod http://127.0.0.1:4177/mode -Method Post -ContentType application/json -Body ('"' + $Value + '"') | Out-Null }
try {
  $SessionId = (bsk session start --json | ConvertFrom-Json).session_id
  bsk navigate http://127.0.0.1:4176 --session $SessionId | Out-Null
  bsk observe --session $SessionId | Out-Null
  Assert-Page 'document.querySelector(".topbar") !== null && !document.body.innerText.includes("正在读取本地任务")' 'app-ready'
  $initial = bsk snapshot --session $SessionId | Out-String
  if ($initial.Contains('"展开任务列表"')) { Activate 'button' '展开任务列表' }
  bsk press Enter --selector '.task-select[aria-label="打开任务：目录调研"]' --session $SessionId | Out-Null
  Activate 'tab' '抓取计划'
  Assert-Page 'document.body.innerText.includes("还没有正式抓取计划")' 'empty'
  Mode 'waiting'
  Activate 'button' '制定正式计划'
  Assert-Page 'document.body.innerText.includes("正在制定计划")' 'generating'
  Activate 'button' '停止生成'
  Assert-Page 'document.body.innerText.includes("计划生成已停止")' 'cancelled'
  Mode 'failed'
  Activate 'button' '重新制定计划'
  Assert-Page 'document.body.innerText.includes("计划生成或证据校验未通过")' 'failed-retry-path'
  Mode 'normal'
  Activate 'button' '重新制定计划'
  Assert-Page 'document.body.innerText.includes("本次授权预算") && [...document.querySelectorAll("button")].some(b=>b.textContent==="确认计划并启动" && !b.disabled)' 'ready-budget-authorization'
  Activate 'button' '步骤详情'
  Assert-Page 'document.querySelector(".detail-content")?.innerText.includes("终止条件") === true' 'step-source-details'
  bsk press Escape --session $SessionId | Out-Null
  Activate 'button' '确认计划并启动'
  Assert-Page 'document.body.innerText.includes("已授权 · 排队中") && document.body.innerText.includes("等待探索执行器接入")' 'durable-queue'
  $state = Invoke-RestMethod http://127.0.0.1:4177/state
  if ($state.plan.executions.Count -ne 1 -or $state.plan.executions[0].status -ne 'queued') { throw 'canonical queue mismatch' }
  Write-Output 'PASS canonical-single-authorization'
  bsk reload --session $SessionId | Out-Null
  bsk observe --session $SessionId | Out-Null
  Activate 'tab' '抓取计划'
  Assert-Page 'document.body.innerText.includes("已授权 · 排队中")' 'refresh-retains-queue'
  bsk emulate --session $SessionId --width 390 --height 844 --dpr 1 --mobile | Out-Null
  bsk observe --session $SessionId | Out-Null
  Activate 'button' '收起任务列表'
  Assert-Page 'innerWidth===390 && !document.querySelector(".task-nav-drawer") && document.documentElement.scrollWidth<=innerWidth' '390px-no-overflow'
  Activate 'button' '步骤详情'
  Assert-Page 'document.querySelector("[role=dialog]")?.innerText.includes("终止条件") === true' '390px-step-drawer'
  bsk screenshot --session $SessionId --out D:/work/browser-capture-tool/work/f4-ui-390.png | Out-Null
  bsk press Escape --session $SessionId | Out-Null
  Assert-Page '!document.querySelector("[role=dialog]") && document.activeElement?.textContent==="步骤详情"' 'escape-focus-return'
  Activate 'button' '停止授权运行'
  Assert-Page 'document.body.innerText.includes("授权运行已停止")' 'cancel-queue'
  Mode 'blocking'
  Assert-Page 'document.body.innerText.includes("版本已变更 · 待复核")' 'source-version-refresh'
  Activate 'button' '重新制定计划'
  Assert-Page 'document.body.innerText.includes("来源缺口待处理") && document.body.innerText.includes("阻塞启动")' 'blocking-gap'
  Mode 'invalidate'
  Assert-Page 'document.body.innerText.includes("版本已变更 · 待复核")' 'stale-plan'
  Activate 'button' '展开任务列表'
  Assert-Page 'document.querySelector(".task-nav-drawer") !== null' 'task-switch-drawer'
  Activate 'button' '打开任务：新需求'
  Assert-Page '!document.querySelector(".task-nav-drawer") && document.querySelector(".topbar h1")?.textContent==="新需求"' 'task-switch-ready'
  Activate 'tab' '抓取计划'
  Assert-Page 'document.body.innerText.includes("还没有正式抓取计划") && !document.body.innerText.includes("已授权 · 排队中")' 'task-isolation'
} finally { if ($SessionId) { bsk session stop $SessionId | Out-Null } }
