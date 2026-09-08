param([Parameter(Mandatory)][ValidatePattern('^[a-z]{4}$')][string]$SessionId)
$ErrorActionPreference = 'Stop'
# 仅对隔离 4174 服务运行；保留 legacy 真实访谈，新建空任务，不发送消息、不调用模型。
function Find-Control([string]$Role, [string]$Name) {
  $pattern = '(?m)^\s*(@e\d+)\s+' + [regex]::Escape($Role) + ' "' + [regex]::Escape($Name) + '"'
  $deadline = (Get-Date).AddSeconds(4)
  do {
    $snapshot = (bsk snapshot --session $SessionId | Out-String)
    $match = [regex]::Match($snapshot, $pattern)
    if ($match.Success) { break }
    Start-Sleep -Milliseconds 100
  } while ((Get-Date) -lt $deadline)
  if (-not $match.Success) { throw "Control not found: $Role / $Name" }
  return $match.Groups[1].Value
}
function Activate([string]$Role, [string]$Name) {
  $reference = Find-Control $Role $Name
  bsk press Enter --ref $reference --session $SessionId | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Activation failed: $Name" }
}
function Assert-Page([string]$Expression, [string]$Name) {
  $deadline = (Get-Date).AddSeconds(3)
  do {
    $result = (bsk evaluate $Expression --session $SessionId | Out-String).Trim()
    if ($result -eq 'true') { break }
    Start-Sleep -Milliseconds 100
  } while ((Get-Date) -lt $deadline)
  if ($LASTEXITCODE -ne 0 -or $result -ne 'true') { throw "$Name failed: $result" }
  Write-Output "PASS $Name"
}
function Select-Task([string]$Title) {
  # BrowserSkill 的 aria 精简快照未收录整行按钮；使用已观察 DOM 的原生 selector 键盘定位。
  bsk click --selector "button.task-select[aria-label='打开任务：$Title']" --session $SessionId | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Task selection failed' }
}
try {
  Assert-Page 'location.port === "4174"' 'isolated-service-only'
  $baseline = Invoke-RestMethod 'http://127.0.0.1:4174/api/interview?taskId=legacy'
  $initialTasks = Invoke-RestMethod 'http://127.0.0.1:4174/api/tasks'
  $legacyTitle = ($initialTasks | Where-Object id -eq 'legacy').title
  bsk reload --session $SessionId | Out-Null
  bsk observe --session $SessionId | Out-Null
  Select-Task $legacyTitle
  Assert-Page 'document.querySelector(".task-workspace:not([hidden])").querySelectorAll(".chat-message").length === 6 && document.querySelectorAll(".task-workspace:not([hidden]) [role=tab]").length === 5' 'legacy-messages-and-five-views'
  Activate 'button' '需求草稿 · v2'
  Assert-Page 'document.querySelector(".draft-drawer[role=dialog]") && !document.querySelector(".task-body > .detail-pane")' 'wide-draft-is-resizable-drawer'
  $versionRef = Find-Control 'combobox' '版本记录 [has-submenu]'
  bsk press Enter --ref $versionRef --session $SessionId | Out-Null
  bsk observe --session $SessionId | Out-Null
  bsk click --selector '[role="option"]:first-child' --session $SessionId | Out-Null
  Assert-Page 'document.querySelector(".draft-dialog-footer button").disabled && document.querySelector(".draft-document").textContent.includes("20") && !document.querySelector("[role=listbox]")' 'old-draft-read-only'
  bsk screenshot --session $SessionId --out D:/work/browser-capture-tool/work/ui-review/layout-draft-wide.png | Out-Null
  Activate 'button' '关闭需求草稿'
  $inputRef = Find-Control 'textbox' '输入需求或回答'
  bsk fill $inputRef --value '任务 A 尚未发送的补充' --session $SessionId | Out-Null
  Activate 'tab' '抓取链路'
  Assert-Page 'document.querySelector(".task-workspace:not([hidden]) .empty-chain-canvas") !== null && document.querySelectorAll(".react-flow__node").length === 0' 'no-fake-task-chain'
  Activate 'button' '查看链路结构样例'
  $nodeRef = Find-Control 'combobox' '选择节点 [has-submenu]'
  bsk press Enter --ref $nodeRef --session $SessionId | Out-Null
  bsk observe --session $SessionId | Out-Null
  bsk click --selector '[role="option"]:nth-child(4)' --session $SessionId | Out-Null
  Assert-Page 'document.querySelectorAll(".react-flow__node").length === 6 && document.querySelector(".node-inspector").textContent.includes("还有下一页")' 'independent-node-canvas-and-condition-detail'
  bsk click --selector '.new-task' --session $SessionId | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Task creation failed' }
  bsk observe --session $SessionId | Out-Null
  Assert-Page 'document.querySelector(".task-workspace:not([hidden])").dataset.taskId !== "legacy" && document.querySelectorAll(".task-workspace:not([hidden]) .chat-message").length === 0' 'new-task-has-no-foreign-messages'
  $newTasks = Invoke-RestMethod 'http://127.0.0.1:4174/api/tasks'
  $newTask = $newTasks | Where-Object { $_.id -notin $initialTasks.id } | Select-Object -First 1
  if (-not $newTask) { throw 'New task missing from service' }
  Activate 'button' ($newTask.title + '的更多操作 [has-submenu]')
  Activate 'menuitem' '重命名'
  $titleRef = Find-Control 'textbox' '任务名称'
  $newTitle = '布局验收 B ' + (Get-Date -Format 'HHmmss')
  bsk fill $titleRef --value $newTitle --session $SessionId | Out-Null
  Activate 'button' '保存名称'
  $inputRef = Find-Control 'textbox' '输入需求或回答'
  bsk fill $inputRef --value '任务 B 独立的未发送内容' --session $SessionId | Out-Null
  Activate 'tab' '来源调研'
  Assert-Page '!document.querySelector(".task-workspace:not([hidden]) .supporting-detail").open && document.querySelector(".task-workspace:not([hidden]) [role=tab][data-state=active]").textContent.includes("来源调研")' 'source-detail-folded-by-default'
  Select-Task $legacyTitle
  Assert-Page 'document.querySelector(".task-workspace:not([hidden]) [role=tab][data-state=active]").textContent.includes("抓取链路") && document.querySelector(".task-workspace:not([hidden]) [aria-label=选择节点]").textContent.includes("还有下一页") && document.querySelectorAll(".react-flow__node").length === 6' 'task-A-tab-node-selection-retained'
  Activate 'tab' '需求对话'
  Assert-Page 'document.querySelector(".task-workspace:not([hidden]) [data-interactive-timeline-composer-textarea=true]").value === "任务 A 尚未发送的补充"' 'task-A-unsent-input-retained'
  Select-Task $newTitle
  Assert-Page 'document.querySelector(".task-workspace:not([hidden]) [role=tab][data-state=active]").textContent.includes("来源调研")' 'task-B-tab-retained'
  Activate 'tab' '需求对话'
  Assert-Page 'document.querySelector(".task-workspace:not([hidden]) [data-interactive-timeline-composer-textarea=true]").value === "任务 B 独立的未发送内容" && !document.querySelector(".task-workspace:not([hidden]) .draft-artifact")' 'task-B-input-and-artifacts-isolated'
  Activate 'tab' '运行结果'
  Activate 'button' '调用审计'
  Assert-Page 'document.querySelector(".detail-pane").textContent.includes("暂无已返回的调用审计")' 'new-task-does-not-inherit-audits'
  Activate 'button' '关闭调用审计'
  $searchRef = Find-Control 'textbox' '搜索任务'
  bsk fill $searchRef --value $newTitle --session $SessionId | Out-Null
  Assert-Page 'document.querySelectorAll(".task-select").length === 1' 'task-search-filters-list'
  $searchRef = Find-Control 'textbox' '搜索任务'
  bsk fill $searchRef --value '' --session $SessionId | Out-Null
  Activate 'button' ($newTitle + '的更多操作 [has-submenu]')
  Activate 'menuitem' '归档任务'
  Activate 'button' '已归档任务'
  Select-Task $newTitle
  Activate 'tab' '需求对话'
  Assert-Page 'document.querySelector(".task-workspace:not([hidden]) [data-interactive-timeline-composer-textarea=true]") === null && document.querySelector(".task-workspace:not([hidden]) .task-notice").textContent.includes("已归档")' 'archived-task-read-only'
  Activate 'button' ($newTitle + '的更多操作 [has-submenu]')
  Activate 'menuitem' '恢复任务'
  Activate 'button' '返回最近任务'
  Assert-Page 'document.querySelector(".task-workspace:not([hidden]) [data-interactive-timeline-composer-textarea=true]")?.disabled === false' 'archive-is-reversible'
  Select-Task $legacyTitle
  Activate 'tab' '运行结果'
  Activate 'button' '调用审计'
  Assert-Page 'document.querySelectorAll(".detail-pane .audit-record").length === 3 && !document.querySelector(".detail-pane .audit-record").open' 'real-audits-secondary-and-folded'
  Activate 'button' '关闭调用审计'
  Activate 'tab' '抓取计划'
  Activate 'button' '查看步骤结构样例'
  Assert-Page 'document.querySelectorAll(".task-workspace:not([hidden]) .plan-card").length === 3 && !document.querySelector(".task-workspace:not([hidden]) .plan-detail").open' 'plan-goals-visible-supporting-fields-folded'
  Activate 'tab' '需求对话'
  bsk screenshot --session $SessionId --out D:/work/browser-capture-tool/work/ui-review/layout-tasks-wide.png | Out-Null
  Activate 'button' '切换为浅色主题'
  bsk emulate --session $SessionId --width 804 --height 1000 --dpr 1 | Out-Null
  bsk observe --session $SessionId | Out-Null
  Assert-Page 'document.querySelector(".task-nav-drawer") !== null' 'compact-task-list-is-left-drawer'
  Select-Task $legacyTitle
  Activate 'button' '需求草稿 · v2'
  Assert-Page 'document.querySelector(".draft-drawer[role=dialog]") && document.querySelector(".draft-drawer-body").offsetWidth <= innerWidth' 'compact-draft-is-right-drawer'
  bsk screenshot --session $SessionId --out D:/work/browser-capture-tool/work/ui-review/layout-draft-804.png | Out-Null
  bsk press Escape --session $SessionId | Out-Null
  Assert-Page '!document.querySelector("[role=dialog]") && document.activeElement.textContent.includes("需求草稿") && document.querySelector(".task-workspace:not([hidden]) .thread-bottom").getBoundingClientRect().bottom <= innerHeight' 'drawer-escape-restores-focus-and-composer'
  Activate 'tab' '抓取链路'
  Assert-Page 'document.querySelector(".detail-drawer[role=dialog]") && document.querySelectorAll(".react-flow__node").length === 6' 'compact-node-detail-drawer'
  bsk press Escape --session $SessionId | Out-Null
  Assert-Page 'document.querySelector(".task-workspace:not([hidden]) .flow-canvas").getBoundingClientRect().width > 650 && document.documentElement.scrollWidth <= innerWidth' 'compact-canvas-remains-primary'
  bsk screenshot --session $SessionId --out D:/work/browser-capture-tool/work/ui-review/layout-chain-804.png | Out-Null
  Activate 'tab' '需求对话'
  bsk screenshot --session $SessionId --out D:/work/browser-capture-tool/work/ui-review/layout-chat-804.png | Out-Null
  $after = Invoke-RestMethod 'http://127.0.0.1:4174/api/interview?taskId=legacy'
  $blank = Invoke-RestMethod ('http://127.0.0.1:4174/api/interview?taskId=' + $newTask.id)
  if ($after.revision -ne $baseline.revision -or $after.audits.Count -ne $baseline.audits.Count -or $blank.messages.Count -ne 0 -or $blank.audits.Count -ne 0) { throw 'Read-only layout acceptance changed interview facts' }
  Write-Output 'PASS no-new-model-calls-or-interview-mutations'
  bsk console --session $SessionId --limit 5 --max-text-chars 400
} finally {
  bsk session stop $SessionId
}
