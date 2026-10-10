$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
if ((Get-Location).Path -ne $repo) { throw 'Run from the actual checkout root.' }
# 只安装独立实验构建/协议校准依赖；不改变产品依赖、服务配置或检测状态。
& npm.cmd --prefix tools/antibot-lab ci --workspaces=false --ignore-scripts --no-audit --no-fund --loglevel=error
if ($LASTEXITCODE -ne 0) { throw 'lab_dependency_install_failed' }
foreach ($name in @('auth', 'creep-build', 'privacy-pass')) {
    $runtime = Join-Path $repo "work/antibot-service/runtime/$name"
    if (-not (Test-Path -LiteralPath $runtime)) { New-Item -ItemType Directory -Path $runtime | Out-Null }
    foreach ($file in @('package.json', 'package-lock.json')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot "dependencies/$name/$file") -Destination (Join-Path $runtime $file)
    }
    & npm.cmd --prefix $runtime ci --ignore-scripts --no-audit --no-fund --loglevel=error
    if ($LASTEXITCODE -ne 0) { throw "fixture_dependency_install_failed:$name" }
}
& node --input-type=module -e "import {build} from 'esbuild'; await build({entryPoints:['tools/antibot-lab/tests/input-fixture.tsx'],bundle:true,platform:'browser',format:'iife',outfile:'work/antibot-service/runtime/input-fixture.js'});"
if ($LASTEXITCODE -ne 0) { throw 'input_fixture_build_failed' }
foreach ($kind in @('base', '--workers', '--devices')) {
    if ($kind -eq 'base') { & node tools/antibot-lab/tests/build-creep.mjs }
    else { & node tools/antibot-lab/tests/build-creep.mjs $kind }
    if ($LASTEXITCODE -ne 0) { throw "creep_fixture_build_failed:$kind" }
}
