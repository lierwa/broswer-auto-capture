param([switch]$DomEvents)
$ErrorActionPreference = 'Stop'
$SessionId = $null
function Assert-Page([string]$Expression, [string]$Name) {
  $deadline = (Get-Date).AddSeconds(15)
  do {
    $result = bsk --json evaluate $Expression --session $SessionId | Out-String | ConvertFrom-Json
    if ($result.ok -and $result.value -eq $true) { Write-Output "PASS $Name"; return }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)
  bsk observe --session $SessionId | Write-Output
  throw "$Name failed"
}
function Activate([string]$Role, [string]$Name) {
  $snapshot = bsk observe --session $SessionId | Out-String
  $pattern = '(?m)^\s*(@e\d+)\s+' + [regex]::Escape($Role) + ' "' + [regex]::Escape($Name) + '"'
  $match = [regex]::Match($snapshot, $pattern)
  if ($DomEvents) {
    $nameJson = $Name | ConvertTo-Json -Compress
    $selector = if ($Role -eq 'tab') { '[role=tab]' } else { 'button' }
    $expression = "(() => { const e=[...document.querySelectorAll('$selector')].find(e=>e.getBoundingClientRect().width>0 && (e.textContent.trim()===$nameJson || e.getAttribute('aria-label')===$nameJson || ('$Role'==='tab' && e.textContent.includes($nameJson)))); if(!e)throw Error('control missing'); e.focus(); e.click(); return true })()"
    $result = bsk --json evaluate $expression --session $SessionId | Out-String | ConvertFrom-Json
    if (-not $result.ok) { throw "control event failed: $Name" }
  } else {
    if (-not $match.Success -and $Name.StartsWith('打开任务：')) {
      bsk press Enter --selector ".task-select[aria-label=`"$Name`"]" --session $SessionId | Out-Null
    } elseif (-not $match.Success) { Write-Output $snapshot; throw "missing control: $Name" }
    else { bsk click $match.Groups[1].Value --session $SessionId | Out-Null }
  }
}
try {
  $SessionId = (bsk session start --json | ConvertFrom-Json).session_id
  bsk navigate http://127.0.0.1:4176 --session $SessionId | Out-Null
  bsk emulate --width 1440 --height 900 --dpr 1 --session $SessionId | Out-Null
  bsk observe --session $SessionId | Out-Null
  Assert-Page 'document.querySelector(".topbar")!==null && !document.body.innerText.includes("正在读取本地任务")' 'app-ready'
  $tree = bsk observe --session $SessionId | Out-String
  if ($tree.Contains('"展开任务列表"')) { Activate 'button' '展开任务列表' }
  Activate 'button' '打开任务：目录调研'
  Assert-Page 'document.querySelector(".task-workspace:not([hidden])")?.getAttribute("aria-label")==="目录调研"' 'selected-task'
  Activate 'tab' '运行结果'
  Assert-Page 'document.querySelector(".task-workspace:not([hidden]) [role=tab][aria-selected=true]")?.textContent.includes("运行结果")===true' 'results-tab-activation'
  Assert-Page 'document.body.innerText.includes("当前任务尚未运行")' 'empty-results'
  Activate 'tab' '抓取计划'
  Assert-Page 'document.body.innerText.includes("确认计划并启动")' 'plan-ready'
  Activate 'button' '确认计划并启动'
  Activate 'tab' '运行结果'
  Assert-Page 'document.body.innerText.includes("部分完成") && document.body.innerText.includes("2/2 个步骤结束")' 'batch-results'
  $before = Invoke-RestMethod http://127.0.0.1:4177/state
  if ($before.plan.executions[-1].capture.steps[1].rows.Count -ne 2) { throw 'canonical results mismatch' }
  Write-Output 'PASS canonical-two-results'
  Activate 'button' '独立复跑'
  Assert-Page 'document.body.innerText.includes("授权新的独立复跑")' 'review-replay-authorization'
  Activate 'button' '确认范围与预算并启动'
  Assert-Page 'document.body.innerText.includes("部分完成") && !document.body.innerText.includes("授权新的独立复跑")' 'replay-settled'
  $after = Invoke-RestMethod http://127.0.0.1:4177/state
  if ($after.plan.executions.Count -ne 2 -or $after.plan.executions[0].id -eq $after.plan.executions[1].id -or $after.chains.records.Count -ne 2) { throw 'independent replay mismatch' }
  Write-Output 'PASS canonical-independent-replay-no-exploration'
  bsk reload --session $SessionId | Out-Null
  bsk observe --session $SessionId | Out-Null
  Activate 'tab' '运行结果'
  Assert-Page 'document.body.innerText.includes("部分完成")' 'refresh-results'
  Activate 'button' '收起任务列表'
  bsk emulate --width 390 --height 844 --dpr 1 --mobile --session $SessionId | Out-Null
  bsk observe --session $SessionId | Out-Null
  Assert-Page 'document.documentElement.scrollWidth<=innerWidth' '390-no-overflow'
  Activate 'button' '查看来源记录'
  Assert-Page 'document.querySelector("[role=dialog]")?.innerText.includes("稳定来源键")===true' 'source-detail-drawer'
  if ($DomEvents) { Activate 'button' '关闭来源记录' } else { bsk press Escape --session $SessionId | Out-Null }
  Assert-Page '!document.querySelector(".detail-drawer[role=dialog]") && document.activeElement?.textContent.includes("查看来源记录")===true' 'close-and-focus-return'
  bsk screenshot --out D:/work/browser-capture-tool/work/f6-results-390.png --session $SessionId | Out-Null
  Write-Output 'PASS results-ui'
} finally { if ($SessionId) { bsk session stop $SessionId | Out-Null } }
