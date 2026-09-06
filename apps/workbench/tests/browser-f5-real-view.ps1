param([switch]$Wide)
$ErrorActionPreference = 'Stop'
$SessionId = $null
function Wait-View([string]$Expression) {
  $deadline = (Get-Date).AddSeconds(15)
  do {
    $result = bsk --json evaluate $Expression --session $SessionId | Out-String | ConvertFrom-Json
    if ($result.ok -and $result.value -eq $true) { Write-Output "PASS $Expression"; return }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)
  bsk observe --session $SessionId | Write-Output
  throw "Real chain view did not become ready: $Expression"
}
try {
  $SessionId = (bsk session start --json | ConvertFrom-Json).session_id
  bsk navigate http://127.0.0.1:4178 --session $SessionId | Out-Null
  bsk emulate --session $SessionId --width 1440 --height 900 --dpr 1 | Out-Null
  bsk observe --session $SessionId | Out-Null
  Wait-View 'document.querySelector(".topbar")!==null && !document.body.innerText.includes("正在读取本地任务")'
  # 当前 BrowserSkill 覆盖层拦截原生输入；此验收只证明控件事件、真实数据投影和布局。
  bsk evaluate 'document.querySelector(".task-workspace:not([hidden]) [id$=trigger-nodes]").click()' --session $SessionId | Out-Null
  Wait-View 'document.body.innerText.includes("换输入验证通过") && document.querySelectorAll(".capture-node").length===12'
  if ($Wide) { bsk screenshot --session $SessionId --out D:/work/browser-capture-tool/work/f5-real-chain-wide.png | Out-Null; return }
  bsk evaluate 'document.querySelector(".task-workspace:not([hidden]) .step-switcher button:nth-child(2)").click()' --session $SessionId | Out-Null
  Wait-View 'document.body.innerText.includes("步骤预算已用尽") && document.body.innerText.includes("完整剩余范围保留")'
  bsk evaluate 'document.querySelector(".topbar button[aria-label=\"收起任务列表\"]")?.click()' --session $SessionId | Out-Null
  bsk emulate --session $SessionId --width 390 --height 844 --dpr 1 --mobile | Out-Null
  bsk observe --session $SessionId | Out-Null
  Wait-View 'innerWidth===390 && !document.querySelector(".task-nav-drawer") && document.documentElement.scrollWidth<=innerWidth'
  bsk screenshot --session $SessionId --out D:/work/browser-capture-tool/work/f5-real-chain-390.png | Out-Null
  Write-Output 'PASS actual 12-node verified directory graph, actual collect budget stop, 390px no overflow; DOM control events'
} finally { if ($SessionId) { bsk session stop $SessionId | Out-Null } }
