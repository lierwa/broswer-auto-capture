$ErrorActionPreference = 'Stop'
$SessionId = $null
function Wait-View([string]$Expression) {
  $deadline = (Get-Date).AddSeconds(12)
  do {
    $result = bsk --json evaluate $Expression --session $SessionId | Out-String | ConvertFrom-Json
    if ($result.ok -and $result.value -eq $true) { return }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)
  throw 'Real plan view did not become ready'
}
try {
  $SessionId = (bsk session start --json | ConvertFrom-Json).session_id
  bsk navigate http://127.0.0.1:4178 --session $SessionId | Out-Null
  bsk observe --session $SessionId | Out-Null
  Wait-View 'document.querySelector(".topbar")!==null && !document.body.innerText.includes("正在读取本地任务")'
  $snapshot = bsk snapshot --session $SessionId | Out-String
  $ref = [regex]::Match($snapshot, '(?m)^\s*(@e\d+) tab "抓取计划"').Groups[1].Value
  if (-not $ref) { throw 'Missing plan tab' }
  bsk press Enter --ref $ref --session $SessionId | Out-Null
  Wait-View 'document.body.innerText.includes("480 条浏览器命令") && document.body.innerText.includes("已授权 · 排队中")'
  bsk screenshot --session $SessionId --out D:/work/browser-capture-tool/work/f4-real-plan-wide.png | Out-Null
  bsk emulate --session $SessionId --width 390 --height 844 --dpr 1 --mobile | Out-Null
  bsk observe --session $SessionId | Out-Null
  $snapshot = bsk snapshot --session $SessionId | Out-String
  $ref = [regex]::Match($snapshot, '(?m)^\s*(@e\d+) button "收起任务列表"').Groups[1].Value
  if ($ref) { bsk press Enter --ref $ref --session $SessionId | Out-Null }
  Wait-View '!document.querySelector(".task-nav-drawer") && document.documentElement.scrollWidth<=innerWidth'
  bsk observe --session $SessionId | Out-Null
  bsk press Enter --selector '.plan-card:nth-child(3) button' --session $SessionId | Out-Null
  Wait-View 'document.querySelector("[role=dialog]")?.innerText.includes("按规则生成") === true && document.documentElement.scrollWidth<=innerWidth'
  bsk screenshot --session $SessionId --out D:/work/browser-capture-tool/work/f4-real-plan-390.png | Out-Null
  Write-Output 'PASS real plan: full-scope 480-command budget, durable queue, derived-field rule and 390px layout'
} finally { if ($SessionId) { bsk session stop $SessionId | Out-Null } }
