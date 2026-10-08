param([Parameter(Mandatory=$true)][string]$RunDirectory)
$ErrorActionPreference = 'Stop'
# WHY：只收回到期、已关闭的本轮实验数据；不清理 work 根或任何个人 Profile。
$checkout = (Get-Location).Path
$parent = [IO.Path]::GetFullPath((Join-Path $checkout 'work/antibot-m0'))
$target = (Resolve-Path -LiteralPath $RunDirectory).Path
$item = Get-Item -LiteralPath $target
if ($item.Parent.FullName -ne $parent -or $item.Name -notlike 'run-*') { throw 'm0_cleanup_outside_run' }
$manifest = Get-Content -LiteralPath (Join-Path $target 'manifest.json') -Raw | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1 -or $manifest.probe.bundleSha256 -ne '75abba497a00625ed053ce7a0bc9353fa5d5c9859cc67438141fe83d8d0946b2') {
    throw 'm0_cleanup_manifest_mismatch'
}
if ([DateTimeOffset]::UtcNow -lt ([DateTimeOffset]$manifest.createdAt).AddDays(7)) { throw 'm0_evidence_retention_not_elapsed' }
$closed = Get-Content -LiteralPath (Join-Path $target 'lab-closed.json') -Raw | ConvertFrom-Json
if (-not $closed.closed) { throw 'm0_lab_close_unconfirmed' }
if (Get-Process -Id $closed.labProcessId -ErrorAction SilentlyContinue) { throw 'm0_lab_pid_present' }
$entries = @($item) + @(Get-ChildItem -LiteralPath $target -Recurse -Hidden) + @(Get-ChildItem -LiteralPath $target -Recurse)
if ($entries | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) { throw 'm0_cleanup_reparse_point' }
$processes = Get-CimInstance Win32_Process
if ($processes | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($target) }) { throw 'm0_run_process_present' }
Remove-Item -LiteralPath $target -Recurse
if (Test-Path -LiteralPath $target) { throw 'm0_permanent_delete_unconfirmed' }
Write-Output '实验目录已永久删除。固定探针制品未删除。'
