$ErrorActionPreference = 'Stop'
$SessionId = $null
function Assert-Page([string]$Expression, [string]$Name) {
  $deadline = (Get-Date).AddSeconds(10)
  do {
    $result = (bsk --json evaluate $Expression --session $SessionId | Out-String | ConvertFrom-Json)
    if ($result.ok -and $result.value -eq $true) { Write-Output "PASS $Name"; return }
    Start-Sleep -Milliseconds 200
  } while ((Get-Date) -lt $deadline)
  throw "$Name failed"
}
function Activate([string]$Role, [string]$Name) {
  $snapshot = bsk snapshot --session $SessionId | Out-String
  $pattern = '(?m)^\s*(@e\d+)\s+' + [regex]::Escape($Role) + ' "' + [regex]::Escape($Name) + '"'
  $match = [regex]::Match($snapshot, $pattern)
  if (-not $match.Success) { throw "Missing $Name" }
  bsk press Enter --ref $match.Groups[1].Value --session $SessionId | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Action failed: $Name" }
}
function Mode([string]$Value) {
  Invoke-RestMethod http://127.0.0.1:4177/mode -Method Post -ContentType application/json -Body ('"' + $Value + '"') | Out-Null
}
try {
  $SessionId = (bsk session start --json | ConvertFrom-Json).session_id
  bsk navigate http://127.0.0.1:4176 --session $SessionId | Out-Null
  bsk observe --session $SessionId | Out-Null
  bsk press Enter --selector '.task-select[aria-label="打开任务：目录调研"]' --session $SessionId | Out-Null
  Activate 'tab' '来源调研'
  Assert-Page 'document.body.innerText.includes("范围已确认，准备核验来源")' 'empty'
  Mode 'waiting'
  Activate 'button' '开始来源调研'
  Assert-Page 'document.body.innerText.includes("停止调研")' 'running'
  Activate 'button' '停止调研'
  Assert-Page 'document.body.innerText.includes("调研已停止")' 'cancelled'
  Mode 'normal'
  Activate 'button' '重新调研'
  Assert-Page 'document.body.innerText.includes("规划证据已具备")' 'completed'
  Activate 'button' '来源详情'
  Assert-Page 'document.querySelector(".source-detail")?.innerText.includes("名称") === true && document.querySelector(".source-detail")?.innerText.includes("https://example.com/catalog") === true' 'evidence-detail'
  Activate 'button' '关闭来源详情'
  bsk reload --session $SessionId | Out-Null
  bsk observe --session $SessionId | Out-Null
  Activate 'tab' '来源调研'
  Assert-Page 'document.body.innerText.includes("规划证据已具备")' 'refresh'
  Mode 'manual'
  Activate 'button' '重新调研'
  Assert-Page 'document.body.innerText.includes("来源需要人工处理")' 'manual'
  Mode 'failed'
  Activate 'button' '重新调研'
  Assert-Page 'document.body.innerText.includes("调研未完成，已取得证据保留")' 'failed'
  Mode 'partial'
  Activate 'button' '重新调研'
  Assert-Page 'document.body.innerText.includes("存在覆盖缺口") && document.body.innerText.includes("代表页名称字段尚无依据")' 'partial'
  bsk emulate --session $SessionId --width 390 --height 844 --dpr 1 --mobile | Out-Null
  bsk observe --session $SessionId | Out-Null
  Activate 'button' '收起任务列表'
  Assert-Page 'innerWidth===390 && !document.querySelector(".task-nav-drawer") && document.documentElement.scrollWidth<=innerWidth' '390px-no-overflow'
  Activate 'button' '来源详情'
  Assert-Page 'document.querySelector("[role=dialog]")?.innerText.includes("代表页观察") === true' '390px-evidence-drawer'
  bsk screenshot --session $SessionId --out D:/work/browser-capture-tool/work/f3-ui-390.png | Out-Null
  bsk press Escape --session $SessionId | Out-Null
  Assert-Page '!document.querySelector("[role=dialog]")' 'escape-closes'
  Activate 'button' '带证据回到需求对话'
  Assert-Page 'document.querySelector("[role=tab][data-state=active]")?.innerText.includes("需求对话") === true' 'return-interview'
  $canonical = Invoke-RestMethod http://127.0.0.1:4177/state
  if ($canonical.interview.revision -ne 2 -or $canonical.research.staleIds.Count -eq 0) { throw 'Gap handoff missing canonical revision' }
  Write-Output 'PASS canonical-gap-handoff'
} catch {
  if ($SessionId) { bsk observe --session $SessionId; bsk screenshot --session $SessionId --out D:/work/browser-capture-tool/work/f3-ui-failure.png | Out-Null }
  throw
} finally { if ($SessionId) { bsk session stop $SessionId | Out-Null } }
