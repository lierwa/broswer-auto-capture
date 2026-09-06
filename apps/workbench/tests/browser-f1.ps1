param([Parameter(Mandatory)][ValidatePattern('^[a-z]{4}$')][string]$SessionId)
$ErrorActionPreference = 'Stop'
# 仅连接 f1-browser-server.ts 的隔离替身服务。页面交互走原生键盘，服务读数核验 canonical 事实。
function Assert-Page([string]$Expression, [string]$Name) {
  $deadline = (Get-Date).AddSeconds(8)
  do {
    $result = (bsk evaluate $Expression --session $SessionId | Out-String).Trim()
    if ($result -eq 'true') { break }
    Start-Sleep -Milliseconds 100
  } while ((Get-Date) -lt $deadline)
  if ($result -ne 'true') { throw "$Name failed: $result" }
  Write-Output "PASS $Name"
}
function Activate([string]$Role, [string]$Name) {
  $pattern = '(?m)^\s*(@e\d+)\s+' + [regex]::Escape($Role) + ' "' + [regex]::Escape($Name) + '"'
  $deadline = (Get-Date).AddSeconds(4)
  do {
    $snapshot = bsk snapshot --session $SessionId | Out-String
    $match = [regex]::Match($snapshot, $pattern)
    if ($match.Success) { break }
    Start-Sleep -Milliseconds 100
  } while ((Get-Date) -lt $deadline)
  if (-not $match.Success) { throw "Missing control: $Role / $Name" }
  if ($Role -eq 'option') { bsk click $match.Groups[1].Value --session $SessionId | Out-Null }
  else { bsk press Enter --ref $match.Groups[1].Value --session $SessionId | Out-Null }
  if ($LASTEXITCODE -ne 0) { throw "Activation failed: $Name" }
}
function Send-Message([string]$Text) {
  bsk observe --session $SessionId | Out-Null
  bsk fill '.task-workspace:not([hidden]) .chat-input' --value $Text --session $SessionId | Out-Null
  Activate 'button' '发送消息'
}
try {
  bsk observe --session $SessionId | Out-Null
  Assert-Page 'location.port === "4174"' 'isolated-F1-fixture'
  Activate 'button' '新建需求'
  Assert-Page 'document.querySelector(".task-workspace:not([hidden]) .chat-input")?.disabled === false && document.querySelectorAll(".task-workspace:not([hidden]) .chat-message").length === 0' 'formal-create-empty-ready'
  $taskId = (bsk evaluate 'document.querySelector(".task-workspace:not([hidden])").dataset.taskId' --session $SessionId | Out-String).Trim('"', "`r", "`n", ' ')
  Send-Message 'F1先提问：整理公开商品资料'
  Assert-Page 'document.querySelectorAll(".task-workspace:not([hidden]) .decision-option").length === 2 && !document.querySelector(".task-workspace:not([hidden]) .decision-option").disabled' 'formal-question-visible'
  bsk observe --session $SessionId | Out-Null
  bsk press Enter --selector '.task-workspace:not([hidden]) .decision-option' --session $SessionId | Out-Null
  Assert-Page 'document.querySelectorAll(".task-workspace:not([hidden]) .chat-message").length === 4 && document.querySelector(".task-workspace:not([hidden]) .draft-artifact") !== null' 'continuous-answer-draft'
  $state = Invoke-RestMethod ("http://127.0.0.1:4174/api/interview?taskId=$taskId")
  if ($state.decisions.Count -ne 1 -or $state.decisions[0].kind -ne 'option' -or $state.audits[0].model -ne 'gpt-5.6-terra') { throw 'Option decision or fixture audit missing' }
  Activate 'button' '需求草稿 · v1'
  Activate 'button' '确认需求草稿'
  Assert-Page 'document.querySelector(".confirmed-next") !== null' 'formal-confirmation-visible'
  Activate 'button' '关闭需求草稿'
  bsk reload --session $SessionId | Out-Null
  bsk observe --session $SessionId | Out-Null
  Assert-Page 'document.querySelectorAll(".task-workspace:not([hidden]) .chat-message").length === 4 && document.querySelector(".confirmed-next") !== null' 'reload-retains-confirmed-history'
  Send-Message 'F1开放问题：补充品牌与品类范围'
  Assert-Page 'document.querySelectorAll(".task-workspace:not([hidden]) .decision-question")[1]?.textContent.includes("品牌或品类") === true && [...document.querySelectorAll(".task-workspace:not([hidden]) .decision-option")].every((item) => item.disabled) && document.querySelectorAll(".task-workspace:not([hidden]) .decision-block")[1]?.querySelectorAll("button").length === 0' 'open-question-needs-no-intermediate-button-history-readonly'
  Send-Message '优先覆盖海尔和美的在售冰箱，没有现成商品链接'
  Assert-Page 'document.querySelector(".task-workspace:not([hidden]) .interview-bar")?.textContent.includes("v2") === true && document.querySelectorAll(".task-workspace:not([hidden]) textarea").length === 1' 'open-answer-produces-brief-draft-with-single-composer'
  $openAnswered = Invoke-RestMethod ("http://127.0.0.1:4174/api/interview?taskId=$taskId")
  if (@($openAnswered.decisions | Where-Object kind -eq 'option').Count -ne 1 -or @($openAnswered.decisions | Where-Object kind -eq 'draft_confirmation').Count -ne 1 -or $openAnswered.drafts.Count -ne 2 -or $null -eq $openAnswered.drafts[1].brief) { throw 'Open answer did not preserve option/confirmation history or structured brief' }
  Activate 'button' '需求草稿 · v2'
  Assert-Page 'document.querySelector(".draft-drawer[role=dialog]") !== null && Math.abs(document.querySelector(".draft-drawer").getBoundingClientRect().right - innerWidth) < 2 && document.querySelector(".draft-version-label .rt-SelectTrigger") !== null' 'draft-is-right-drawer-with-library-select'
  bsk press ArrowLeft --selector '[aria-label="调整需求草稿宽度"]' --session $SessionId | Out-Null
  Assert-Page 'document.querySelector(".draft-drawer-body").offsetWidth === 592' 'drawer-keyboard-resize'
  # 当前 bsk 没有 drag 命令；向已观察的握柄发送浏览器鼠标事件，核验组件的拖拽处理而非直接改状态。
  bsk evaluate '(async () => { const grip = document.querySelector(".drawer-resize-grip"); const r = grip.getBoundingClientRect(); const x = r.x + r.width / 2; const y = r.y + r.height / 2; grip.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: x, clientY: y, button: 0, buttons: 1 })); await new Promise(requestAnimationFrame); window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: x - 160, clientY: y, buttons: 1 })); await new Promise(requestAnimationFrame); window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: x - 160, clientY: y, button: 0 })); })()' --session $SessionId | Out-Null
  Assert-Page 'document.querySelector(".draft-drawer-body").offsetWidth === 752' 'drawer-mouse-drag-resize'
  bsk press Enter --selector '[aria-label="版本记录"]' --session $SessionId | Out-Null
  Activate 'option' 'v1 · F1 验收需求'
  Assert-Page 'document.querySelector(".draft-dialog-footer").textContent.includes("历史版本") && [...document.querySelectorAll(".draft-dialog-footer button")].every((item) => item.disabled)' 'library-version-history-is-readonly'
  bsk press Enter --selector '[aria-label="版本记录"]' --session $SessionId | Out-Null
  Activate 'option' 'v2 · F1 验收需求'
  Assert-Page 'document.querySelector(".draft-dialog-footer").textContent.includes("保存当前需求版本") && document.querySelector("[role=listbox]") === null' 'library-version-switch-restores-current'
  bsk press Escape --session $SessionId | Out-Null
  Assert-Page 'document.querySelector(".draft-drawer") === null && document.activeElement.textContent.includes("需求草稿")' 'drawer-escape-restores-trigger-focus'
  Activate 'button' '需求草稿 · v2'
  Assert-Page 'document.querySelector(".draft-drawer-body").offsetWidth === 752' 'drawer-reopen-retains-width'
  Activate 'button' '确认需求草稿'
  Activate 'button' '关闭需求草稿'
  Send-Message 'F1慢轮次：补充范围'
  Assert-Page 'document.querySelector("button[aria-label=停止生成]") !== null && !document.querySelector(".confirmed-next")' 'new-input-invalidates-confirmation'
  bsk reload --session $SessionId | Out-Null
  bsk observe --session $SessionId | Out-Null
  Assert-Page 'document.querySelector("button[aria-label=停止生成]") !== null' 'reload-reconnects-active-turn'
  Activate 'button' '新建需求'
  Assert-Page 'document.querySelector(".task-workspace:not([hidden]) .task-notice")?.textContent.includes("正在处理需求") === true' 'other-task-actual-running-notice'
  bsk observe --session $SessionId | Out-Null
  bsk fill '.task-workspace:not([hidden]) .chat-input' --value '另一任务未发送的内容' --session $SessionId | Out-Null
  Assert-Page 'document.querySelector(".task-workspace:not([hidden]) .chat-input").value === "另一任务未发送的内容" && document.querySelector(".task-workspace:not([hidden]) button[aria-label=发送消息]").disabled' 'other-task-editable-send-blocked'
  bsk press Enter --selector 'button.task-select[aria-label="打开任务：F1 验收需求"]' --session $SessionId | Out-Null
  Activate 'button' '停止生成'
  Assert-Page 'document.querySelector(".task-workspace:not([hidden]) .assistant-body") !== null && !document.querySelector(".task-workspace:not([hidden]) button[aria-label=停止生成]") && document.querySelector(".task-workspace:not([hidden])").textContent.includes("本轮未提交草稿")' 'cancelled-turn-is-visible-terminal'
  $cancelled = Invoke-RestMethod ("http://127.0.0.1:4174/api/interview?taskId=$taskId")
  if ($cancelled.active -or $cancelled.drafts.Count -ne 2 -or $cancelled.confirmedVersion -ne $null) { throw 'Cancelled round submitted or stayed active' }
  Send-Message 'F1失败轮次：验证可重试'
  Assert-Page 'document.querySelector(".task-workspace:not([hidden])").textContent.includes("结果未提交") && !document.querySelector(".task-workspace:not([hidden]) button[aria-label=停止生成]")' 'failure-is-visible-and-preserves-history'
  $failed = Invoke-RestMethod ("http://127.0.0.1:4174/api/interview?taskId=$taskId")
  $users = @($failed.messages | Where-Object role -eq 'user').Count
  Activate 'button' '重试本轮'
  Assert-Page 'document.querySelector(".task-workspace:not([hidden]) .interview-bar").textContent.includes("v3")' 'retry-produces-new-valid-draft'
  $retried = Invoke-RestMethod ("http://127.0.0.1:4174/api/interview?taskId=$taskId")
  if (@($retried.messages | Where-Object role -eq 'user').Count -ne $users -or $retried.drafts.Count -ne 3) { throw 'Retry duplicated user input' }
  bsk emulate --session $SessionId --width 804 --height 1000 --dpr 1 | Out-Null
  bsk observe --session $SessionId | Out-Null
  bsk press Escape --session $SessionId | Out-Null
  Assert-Page 'document.documentElement.scrollWidth <= innerWidth && document.querySelector(".task-workspace:not([hidden]) .thread-bottom").getBoundingClientRect().bottom <= innerHeight' 'F1-narrow-no-overflow-composer-visible'
  Activate 'button' '需求草稿 · v3'
  bsk emulate --session $SessionId --width 390 --height 844 --dpr 1 | Out-Null
  bsk observe --session $SessionId | Out-Null
  Assert-Page 'document.querySelector(".draft-drawer-body").offsetWidth <= innerWidth && document.querySelector(".draft-dialog-footer").getBoundingClientRect().bottom <= innerHeight' 'drawer-mobile-clamped-footer-visible'
  bsk screenshot --session $SessionId --out D:/work/browser-capture-tool/work/ui-review/draft-drawer-390.png | Out-Null
  bsk press Escape --session $SessionId | Out-Null
  bsk emulate --session $SessionId --width 804 --height 1000 --dpr 1 | Out-Null
  bsk screenshot --session $SessionId --out D:/work/browser-capture-tool/work/ui-review/f1-lifecycle-804.png | Out-Null
  Write-Output 'PASS canonical-decisions-cancel-retry-and-fixture-audits'
} finally { bsk session stop $SessionId }
