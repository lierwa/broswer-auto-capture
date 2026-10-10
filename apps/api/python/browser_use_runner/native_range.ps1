$ErrorActionPreference='Stop'
try {
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
    $request=[Console]::ReadLine() | ConvertFrom-Json
    $process=Get-Process -Id $request.owner.pid
    $started=([DateTimeOffset]$process.StartTime.ToUniversalTime()).ToUnixTimeMilliseconds()/1000
    if ($process.ProcessName -ne 'chrome' -or [Math]::Abs($started-$request.owner.started) -gt 0.1 -or $process.MainWindowHandle -eq 0) { throw 'owner_unavailable' }
    $root=[System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
    if ($root.Current.ProcessId -ne $request.owner.pid) { throw 'owner_mismatch' }
    # WHY：只找已拥有窗口中当前聚焦的原生滑块；不扫描桌面、不激活窗口。
    $condition=[System.Windows.Automation.AndCondition]::new(
        [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Slider),
        [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::HasKeyboardFocusProperty,$true))
    $nodes=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,$condition)
    if ($nodes.Count -ne 1) { throw 'focused_range_not_unique' }
    $target=$nodes.Item(0)
    if ($target.Current.AutomationId -cne $request.id -or $target.Current.Name -cne $request.name -or !$target.Current.IsEnabled) { throw 'target_mismatch' }
    $pattern=[System.Windows.Automation.RangeValuePattern]$target.GetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern)
    if ($pattern.Current.IsReadOnly) { throw 'range_read_only' }
    [Console]::WriteLine('{"status":"ready"}')
    if ([Console]::ReadLine() -cne 'apply') { exit 0 }
    # 保留同一UIA对象，不在授权派发后重新寻找可能已经变化的焦点目标。
    if (!$target.Current.HasKeyboardFocus -or !$target.Current.IsEnabled -or $pattern.Current.IsReadOnly) { throw 'target_changed' }
    $pattern.SetValue([double]::Parse($request.value,[Globalization.CultureInfo]::InvariantCulture))
    [Console]::WriteLine('{"status":"dispatched"}')
} catch {
    # 原异常可能含页面名称/值；错误出口只返回固定状态，不记录原对象或输入。
    [Console]::WriteLine('{"status":"unavailable"}')
    exit 1
}
