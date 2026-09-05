param([Parameter(Mandatory)][ValidatePattern('^[a-z]{4}
$ErrorActionPreference = 'Stop'

function Find-Control([string]$Role, [string]$Name) {
  $snapshot = (bsk snapshot --session $SessionId | Out-String)
  $pattern = '(?m)^\s*(@e\d+)\s+' + [regex]::Escape($Role) + ' "' + [regex]::Escape($Name) + '"'
  $match = [regex]::Match($snapshot, $pattern)
  if (-not $match.Success) { Write-Output $snapshot; throw "Control not found: $Role / $Name" }
  return $match.Groups[1].Value
}
function Click-Control([string]$Role, [string]$Name) {
  $reference = Find-Control $Role $Name
  bsk press Enter --ref $reference --session $SessionId | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Click failed: $Name" }
}
function Assert-Page([string]$Expression, [string]$Name) {
  $result = (bsk evaluate $Expression --session $SessionId | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $result -ne 'true') { throw "$Name failed: $result" }
  Write-Output "PASS $Name"
}

try {
  New-Item -ItemType Directory -Path work/ui-review -Force | Out-Null
  $inputRef = Find-Control 'textbox' '回答、补充或纠正'
  bsk fill $inputRef --value '只要一级能效，保留这条未发送的补充' --session $SessionId | Out-Null
  Click-Control 'tab' '抓取链路'
  $nodeRef = Find-Control 'combobox' '选择节点 [has-submenu]'
  bsk select $nodeRef --value '3' --session $SessionId | Out-Null
  Assert-Page 'document.querySelector("#node-selector").value === "3" && document.querySelector(".node-details").textContent.includes("还有下一页")' 'unconfirmed-node-selection'
  bsk screenshot --session $SessionId --out D:/work/browser-capture-tool/work/ui-review/chain-dark.png | Out-Null
  Click-Control 'tab' '来源调研'
  Assert-Page 'document.querySelector(".research-summary button").disabled && document.querySelector(".research-summary").textContent.includes("等待确认")' 'source-gate'
  Click-Control 'tab' '抓取计划'
  Assert-Page 'document.querySelector(".action-gate button").disabled' 'plan-gate'
  bsk press ArrowRight --session $SessionId | Out-Null
  bsk press Enter --session $SessionId | Out-Null
  Assert-Page 'document.querySelector("[role=tab][aria-selected=true]").textContent.includes("抓取链路") && document.querySelector("#node-selector").value === "3"' 'keyboard-tab-and-node-retention'
  Click-Control 'tab' '需求对话'
  Assert-Page 'document.querySelector("#interview-input").value.includes("未发送") && document.querySelector(".draft-confirm button").disabled' 'composer-retention-and-initial-gate'
  $inputRef = Find-Control 'textbox' '回答、补充或纠正'
  bsk fill $inputRef --value '' --session $SessionId | Out-Null
  Click-Control 'button' '采纳这项建议'
  Click-Control 'button' '采纳这项建议'
  Click-Control 'button' '采纳这项建议'
  Assert-Page '!document.querySelector(".draft-confirm button").disabled && document.querySelectorAll(".previous-question").length === 3' 'three-round-transcript-and-draft'
  $versionRef = Find-Control 'combobox' '版本记录 [has-submenu]'
  bsk select $versionRef --value '1' --session $SessionId | Out-Null
  Assert-Page 'document.querySelector(".draft-confirm button").disabled && document.querySelector("#draft-version").value === "1"' 'historical-version-read-only'
  $versionRef = Find-Control 'combobox' '版本记录 [has-submenu]'
  bsk select $versionRef --value 'current' --session $SessionId | Out-Null
  Click-Control 'button' '确认这份需求草稿（演示）'
  Assert-Page 'document.querySelector(".draft-confirm button").textContent.includes("v3 已确认") && document.querySelector("[role=tab][aria-selected=true]").textContent.includes("需求对话")' 'separate-draft-confirmation-no-navigation'
  Click-Control 'tab' '来源调研'
  Assert-Page 'document.querySelector(".research-summary").textContent.includes("需求 v3 已确认") && document.querySelector(".research-summary button").disabled' 'confirmed-draft-still-requires-real-research'
  Click-Control 'tab' '需求对话'
  $inputRef = Find-Control 'textbox' '回答、补充或纠正'
  bsk fill $inputRef --value '改成两家店铺，评论只要 20 条' --session $SessionId | Out-Null
  Click-Control 'button' '保存补充'
  Assert-Page 'document.querySelector(".pending-notes").textContent.includes("两家店铺") && document.querySelector(".draft-confirm button").disabled && !document.querySelector(".draft-confirm button").textContent.includes("已确认")' 'free-text-invalidates-confirmation'
  Click-Control 'tab' '运行结果'
  Assert-Page '!document.querySelector(".table-wrap") && document.querySelector(".run-facts").textContent.includes("未接入")' 'real-results-empty-state'
  Click-Control 'button' '查看结果结构样例'
  Assert-Page 'document.querySelector(".table-wrap").textContent.includes("样例")' 'explicit-sample-results'
  Click-Control 'tab' '需求对话'
  Click-Control 'button' '切换为浅色主题'
  Assert-Page 'document.querySelector(".app-shell").dataset.theme === "light" && document.documentElement.scrollWidth <= innerWidth' 'light-theme-wide-layout'
  bsk screenshot --session $SessionId --out D:/work/browser-capture-tool/work/ui-review/interview-light.png | Out-Null
  bsk emulate --session $SessionId --width 804 --height 1000 --dpr 1 | Out-Null
  Assert-Page 'innerWidth === 804 && document.documentElement.scrollWidth <= innerWidth' '804px-interview-no-overflow'
  Click-Control 'tab' '抓取链路'
  Assert-Page 'document.documentElement.scrollWidth <= innerWidth && document.querySelector(".flow-canvas").getBoundingClientRect().width > 500 && document.querySelector("#node-selector").value === "3"' '804px-chain-visible-and-selection-retained'
  bsk screenshot --session $SessionId --out D:/work/browser-capture-tool/work/ui-review/chain-804.png | Out-Null
  bsk console --session $SessionId --limit 10 --max-text-chars 500
} catch {
  bsk snapshot --session $SessionId
  bsk console --session $SessionId --limit 10
  throw
} finally {
  bsk session stop $SessionId
})][string]$SessionId)
$ErrorActionPreference = 'Stop'

function Find-Control([string]$Role, [string]$Name) {
  $snapshot = (bsk snapshot --session $SessionId | Out-String)
  $pattern = '(?m)^\s*(@e\d+)\s+' + [regex]::Escape($Role) + ' "' + [regex]::Escape($Name) + '"'
  $match = [regex]::Match($snapshot, $pattern)
  if (-not $match.Success) { Write-Output $snapshot; throw "Control not found: $Role / $Name" }
  return $match.Groups[1].Value
}
function Click-Control([string]$Role, [string]$Name) {
  $reference = Find-Control $Role $Name
  bsk press Enter --ref $reference --session $SessionId | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Click failed: $Name" }
}
function Assert-Page([string]$Expression, [string]$Name) {
  $result = (bsk evaluate $Expression --session $SessionId | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $result -ne 'true') { throw "$Name failed: $result" }
  Write-Output "PASS $Name"
}

try {
  $inputRef = Find-Control 'textbox' '回答、补充或纠正'
  bsk fill $inputRef --value '只要一级能效，保留这条未发送的补充' --session $SessionId | Out-Null
  Click-Control 'tab' '抓取链路'
  $nodeRef = Find-Control 'combobox' '选择节点 [has-submenu]'
  bsk select $nodeRef --value '3' --session $SessionId | Out-Null
  Assert-Page 'document.querySelector("#node-selector").value === "3" && document.querySelector(".node-details").textContent.includes("还有下一页")' 'unconfirmed-node-selection'
  bsk screenshot --session $SessionId --out D:/work/browser-capture-tool/work/ui-review/chain-dark.png | Out-Null
  Click-Control 'tab' '来源调研'
  Assert-Page 'document.querySelector(".research-summary button").disabled && document.querySelector(".research-summary").textContent.includes("等待确认")' 'source-gate'
  Click-Control 'tab' '抓取计划'
  Assert-Page 'document.querySelector(".action-gate button").disabled' 'plan-gate'
  bsk press ArrowRight --session $SessionId | Out-Null
  bsk press Enter --session $SessionId | Out-Null
  Assert-Page 'document.querySelector("[role=tab][aria-selected=true]").textContent.includes("抓取链路") && document.querySelector("#node-selector").value === "3"' 'keyboard-tab-and-node-retention'
  Click-Control 'tab' '需求对话'
  Assert-Page 'document.querySelector("#interview-input").value.includes("未发送") && document.querySelector(".draft-confirm button").disabled' 'composer-retention-and-initial-gate'
  $inputRef = Find-Control 'textbox' '回答、补充或纠正'
  bsk fill $inputRef --value '' --session $SessionId | Out-Null
  Click-Control 'button' '采纳这项建议'
  Click-Control 'button' '采纳这项建议'
  Click-Control 'button' '采纳这项建议'
  Assert-Page '!document.querySelector(".draft-confirm button").disabled && document.querySelectorAll(".previous-question").length === 3' 'three-round-transcript-and-draft'
  $versionRef = Find-Control 'combobox' '版本记录 [has-submenu]'
  bsk select $versionRef --value '1' --session $SessionId | Out-Null
  Assert-Page 'document.querySelector(".draft-confirm button").disabled && document.querySelector("#draft-version").value === "1"' 'historical-version-read-only'
  $versionRef = Find-Control 'combobox' '版本记录 [has-submenu]'
  bsk select $versionRef --value 'current' --session $SessionId | Out-Null
  Click-Control 'button' '确认这份需求草稿（演示）'
  Assert-Page 'document.querySelector(".draft-confirm button").textContent.includes("v3 已确认") && document.querySelector("[role=tab][aria-selected=true]").textContent.includes("需求对话")' 'separate-draft-confirmation-no-navigation'
  Click-Control 'tab' '来源调研'
  Assert-Page 'document.querySelector(".research-summary").textContent.includes("需求 v3 已确认") && document.querySelector(".research-summary button").disabled' 'confirmed-draft-still-requires-real-research'
  Click-Control 'tab' '需求对话'
  $inputRef = Find-Control 'textbox' '回答、补充或纠正'
  bsk fill $inputRef --value '改成两家店铺，评论只要 20 条' --session $SessionId | Out-Null
  Click-Control 'button' '保存补充'
  Assert-Page 'document.querySelector(".pending-notes").textContent.includes("两家店铺") && document.querySelector(".draft-confirm button").disabled && !document.querySelector(".draft-confirm button").textContent.includes("已确认")' 'free-text-invalidates-confirmation'
  Click-Control 'tab' '运行结果'
  Assert-Page '!document.querySelector(".table-wrap") && document.querySelector(".run-facts").textContent.includes("未接入")' 'real-results-empty-state'
  Click-Control 'button' '查看结果结构样例'
  Assert-Page 'document.querySelector(".table-wrap").textContent.includes("样例")' 'explicit-sample-results'
  Click-Control 'tab' '需求对话'
  Click-Control 'button' '切换为浅色主题'
  Assert-Page 'document.querySelector(".app-shell").dataset.theme === "light" && document.documentElement.scrollWidth <= innerWidth' 'light-theme-wide-layout'
  bsk screenshot --session $SessionId --out D:/work/browser-capture-tool/work/ui-review/interview-light.png | Out-Null
  bsk emulate --session $SessionId --width 804 --height 1000 --dpr 1 | Out-Null
  Assert-Page 'innerWidth === 804 && document.documentElement.scrollWidth <= innerWidth' '804px-interview-no-overflow'
  Click-Control 'tab' '抓取链路'
  Assert-Page 'document.documentElement.scrollWidth <= innerWidth && document.querySelector(".flow-canvas").getBoundingClientRect().width > 500 && document.querySelector("#node-selector").value === "3"' '804px-chain-visible-and-selection-retained'
  bsk screenshot --session $SessionId --out D:/work/browser-capture-tool/work/ui-review/chain-804.png | Out-Null
  bsk console --session $SessionId --limit 10 --max-text-chars 500
} catch {
  bsk snapshot --session $SessionId
  bsk console --session $SessionId --limit 10
  throw
} finally {
  bsk session stop $SessionId
}
