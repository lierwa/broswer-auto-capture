param([switch]$DomEvents)
$ErrorActionPreference = 'Stop'
$SessionId = $null
function Assert-Page([string]$Expression, [string]$Name) {
  $deadline = (Get-Date).AddSeconds(15)
  do {
    $result = (bsk --json evaluate $Expression --session $SessionId | Out-String | ConvertFrom-Json)
    if ($result.ok -and $result.value -eq $true) { Write-Output "PASS $Name"; return }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)
  bsk observe --session $SessionId | Write-Output
  throw "$Name failed"
}
function Activate([string]$Role, [string]$Name) {
  if ($DomEvents) {
    $targetName = ($Name.Replace(' [has-submenu]', '') | ConvertTo-Json -Compress)
    $targetRole = ($Role | ConvertTo-Json -Compress)
    $expression = "(() => { const role=$targetRole, name=$targetName; const e=Array.from(document.querySelectorAll(role==='button'?'button':'[role='+role+']')).find(e=>e.getBoundingClientRect().width>0 && (e.getAttribute('aria-label')===name || e.textContent.trim()===name || ((role==='tab' || role==='button') && e.textContent.includes(name)))); if(!e) throw Error('missing control'); e.focus(); if(role==='combobox') e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); else if(role==='option') e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); else e.click(); return true; })()"
    $result = bsk --json evaluate $expression --session $SessionId | Out-String | ConvertFrom-Json
    if (-not $result.ok) { throw "DOM event failed: $Name" }
    return
  }
  $snapshot = bsk observe --session $SessionId | Out-String
  $pattern = '(?m)^\s*(@e\d+)\s+' + [regex]::Escape($Role) + ' "' + [regex]::Escape($Name) + '"'
  $match = [regex]::Match($snapshot, $pattern)
  if (-not $match.Success) { Write-Output $snapshot; throw "Missing $Name" }
  bsk click $match.Groups[1].Value --session $SessionId | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Action failed: $Name" }
  bsk observe --session $SessionId | Out-Null
  if ($Role -eq 'tab') {
    $result = bsk --json evaluate 'document.querySelector(".task-workspace:not([hidden]) [role=tab][aria-selected=true]")?.textContent' --session $SessionId | Out-String | ConvertFrom-Json
    if ($result.value.Trim() -ne $Name) {
      $snapshot = bsk observe --session $SessionId | Out-String
      $match = [regex]::Match($snapshot, $pattern)
      bsk press Enter --ref $match.Groups[1].Value --session $SessionId | Out-Null
    }
  }
}
function Select-Task([string]$Title) {
  if ($DomEvents) { Activate 'button' "打开任务：$Title"; return }
  for ($attempt = 0; $attempt -lt 2; $attempt++) {
    bsk press Enter --selector ".task-select[aria-label=`"打开任务：$Title`"]" --session $SessionId | Out-Null
    bsk observe --session $SessionId | Out-Null
    $result = bsk --json evaluate 'document.querySelector(".task-workspace:not([hidden])")?.getAttribute("aria-label")' --session $SessionId | Out-String | ConvertFrom-Json
    if ($result.ok -and $result.value -eq $Title) { return }
  }
  throw "Task selection did not take effect: $Title"
}
function Close-Detail {
  if ($DomEvents) { bsk evaluate 'document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))' --session $SessionId | Out-Null }
  else { bsk press Escape --session $SessionId | Out-Null }
}
try {
  $SessionId = (bsk session start --json | ConvertFrom-Json).session_id
  bsk navigate http://127.0.0.1:4176 --session $SessionId | Out-Null
  bsk emulate --session $SessionId --width 1440 --height 900 --dpr 1 | Out-Null
  bsk observe --session $SessionId | Out-Null
  Assert-Page 'document.querySelector(".topbar") !== null && !document.body.innerText.includes("正在读取本地任务")' 'app-ready'
  $initial = bsk snapshot --session $SessionId | Out-String
  if ($initial.Contains('"展开任务列表"')) { Activate 'button' '展开任务列表' }
  Select-Task '目录调研'
  Assert-Page 'document.querySelector(".task-workspace:not([hidden])")?.getAttribute("aria-label")==="目录调研"' 'selected-task-ready'
  Activate 'tab' '抓取链路'
  Assert-Page 'document.body.innerText.includes("操作链路尚未生成")' 'real-empty'
  Activate 'tab' '抓取计划'
  Assert-Page 'document.body.innerText.includes("确认计划并启动")' 'authorization-control-ready'
  Activate 'button' '确认计划并启动'
  Activate 'tab' '抓取链路'
  Assert-Page 'document.body.innerText.includes("换输入验证通过") && document.querySelectorAll(".capture-node").length===5' 'real-graph-and-verification'
  $state = Invoke-RestMethod http://127.0.0.1:4177/state
  if ($state.chains.records.Count -ne 2 -or @($state.chains.records | Where-Object status -ne 'verified').Count -ne 0) { throw 'canonical chain mismatch' }
  Write-Output 'PASS canonical-two-verified-steps'
  Activate 'button' '采集目录名称'
  Assert-Page 'document.querySelector(".task-workspace:not([hidden]) .flow-canvas")?.textContent.includes("提取名称") === true' 'switch-actual-step'
  Activate 'combobox' '选择实际节点 [has-submenu]'
  Activate 'option' '提取名称'
  Assert-Page 'document.querySelector(".node-inspector")?.innerText.includes("extract_fields") === true' 'node-parameters-and-evidence'
  Close-Detail
  bsk reload --session $SessionId | Out-Null
  bsk observe --session $SessionId | Out-Null
  Activate 'tab' '抓取链路'
  Assert-Page 'document.body.innerText.includes("换输入验证通过")' 'refresh-durable-chain'
  bsk emulate --session $SessionId --width 390 --height 844 --dpr 1 --mobile | Out-Null
  bsk observe --session $SessionId | Out-Null
  Assert-Page 'innerWidth===390 && document.querySelector(".task-nav-drawer") !== null' '390px-task-drawer-ready'
  Activate 'button' '收起任务列表'
  Assert-Page 'innerWidth===390 && document.documentElement.scrollWidth<=innerWidth' '390px-no-overflow'
  Activate 'combobox' '选择实际节点 [has-submenu]'
  Activate 'option' '提取详情链接'
  Assert-Page 'document.querySelector(".detail-drawer")?.textContent.includes("extract_links") === true' '390px-node-drawer'
  if ($DomEvents) {
    Write-Output 'UNVERIFIED native Escape and focus return: BrowserSkill input overlay; reload before independent task-isolation check'
    bsk reload --session $SessionId | Out-Null
    bsk observe --session $SessionId | Out-Null
    Assert-Page 'document.querySelector(".topbar") !== null && !document.querySelector(".detail-drawer")' 'reload-after-drawer'
  } else {
    Close-Detail
    Assert-Page '!document.querySelector(".detail-drawer") && document.activeElement?.getAttribute("aria-label")==="选择实际节点"' 'escape-focus-return'
  }
  Activate 'button' '展开任务列表'
  Select-Task '新需求'
  Assert-Page 'document.querySelector(".task-workspace:not([hidden])")?.getAttribute("aria-label")==="新需求"' 'other-task-ready'
  Activate 'tab' '抓取链路'
  Assert-Page 'document.body.innerText.includes("操作链路尚未生成") && !document.body.innerText.includes("换输入验证通过")' 'task-isolation'
} finally { if ($SessionId) { bsk session stop $SessionId | Out-Null } }
