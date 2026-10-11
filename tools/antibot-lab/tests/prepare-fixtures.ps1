$ErrorActionPreference = 'Stop'
$labRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$labPaths = & node (Join-Path $labRoot 'locations.mjs') | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'lab_configuration_failed' }
# 只安装独立实验构建/协议校准依赖；不改变产品依赖、服务配置或检测状态。
& npm.cmd --prefix $labRoot ci --workspaces=false --ignore-scripts --no-audit --no-fund --loglevel=error
if ($LASTEXITCODE -ne 0) { throw 'lab_dependency_install_failed' }
foreach ($name in @('auth', 'creep-build', 'privacy-pass')) {
    $runtime = Join-Path $labPaths.directory "runtime/$name"
    if (-not (Test-Path -LiteralPath $runtime)) { New-Item -ItemType Directory -Path $runtime | Out-Null }
    foreach ($file in @('package.json', 'package-lock.json')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot "dependencies/$name/$file") -Destination (Join-Path $runtime $file)
    }
    & npm.cmd --prefix $runtime ci --ignore-scripts --no-audit --no-fund --loglevel=error
    if ($LASTEXITCODE -ne 0) { throw "fixture_dependency_install_failed:$name" }
}
& node (Join-Path $PSScriptRoot 'build-input.mjs')
if ($LASTEXITCODE -ne 0) { throw 'input_fixture_build_failed' }
foreach ($kind in @('base', '--workers', '--devices')) {
    if ($kind -eq 'base') { & node (Join-Path $PSScriptRoot 'build-creep.mjs') }
    else { & node (Join-Path $PSScriptRoot 'build-creep.mjs') $kind }
    if ($LASTEXITCODE -ne 0) { throw "creep_fixture_build_failed:$kind" }
}
