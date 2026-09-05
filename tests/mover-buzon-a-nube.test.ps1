# Local Windows smoke test: synthetic files only, no scheduled task registration.
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$tempParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
$root = Join-Path $tempParent ("clarvex-buzon-test-" + [guid]::NewGuid().ToString("N"))
$launcher = Join-Path $root "scripts con espacios\mover-buzon-a-nube.vbs"
$originalLocalAppData = $env:LOCALAPPDATA
$passed = 0

function Assert-Case([bool]$condition, [string]$name) {
    if (-not $condition) { throw "FAIL: $name" }
    Write-Output "PASS: $name"
    $script:passed++
}

function Run-Hidden([string[]]$ScriptArguments) {
    $arguments = '//B //Nologo "' + $launcher + '"'
    foreach ($argument in $ScriptArguments) {
        $arguments += ' "' + ($argument -replace '(\\+)$', '$1$1') + '"'
    }
    $process = Start-Process -FilePath (Join-Path $env:WINDIR 'System32\wscript.exe') `
        -ArgumentList $arguments -WindowStyle Hidden -PassThru
    try {
        if (-not $process.WaitForExit(30000)) { throw 'Hidden launcher timed out.' }
        $process.Refresh()
        return $process.ExitCode
    } finally {
        $process.Dispose()
    }
}

try {
    $source = Join-Path $root "buzon sintetico"
    $cloud = Join-Path $root "nube sintetica"
    $target = Join-Path $cloud "Buzon"
    $logDir = Join-Path $root "logs"
    New-Item -ItemType Directory -Path (Split-Path -Parent $launcher), $source, $target, $logDir | Out-Null
    Copy-Item -LiteralPath (Join-Path $repo "scripts\mover-buzon-a-nube.vbs") -Destination $launcher
    Copy-Item -LiteralPath (Join-Path $repo "scripts\mover-buzon-a-nube.ps1") -Destination (Split-Path -Parent $launcher)
    $env:LOCALAPPDATA = $logDir
    Set-Content -LiteralPath (Join-Path $source "prueba.txt") -Value "synthetic payload" -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $source ".syncthing.prueba.tmp") -Value "incomplete" -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $source ".stignore") -Value "metadata" -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $target "prueba.txt") -Value "existing payload" -Encoding UTF8
    $sourceHash = (Get-FileHash -LiteralPath (Join-Path $source "prueba.txt")).Hash
    $existingHash = (Get-FileHash -LiteralPath (Join-Path $target "prueba.txt")).Hash

    $result = Run-Hidden @('-Simular', '-RutaBuzon', ($source + '\'), '-RutaNube', $cloud)
    Assert-Case ($result -eq 0) 'Simulation exits successfully (paths with spaces and trailing slash)'
    Assert-Case (Test-Path -LiteralPath (Join-Path $source "prueba.txt")) 'Simulation leaves source untouched'
    Assert-Case (-not (Test-Path -LiteralPath (Join-Path $target "prueba (2).txt"))) 'Simulation creates no destination file'

    $result = Run-Hidden @('-RutaBuzon', $source, '-RutaNube', $cloud)
    Assert-Case ($result -eq 0) 'Hidden transfer waits for completion and returns success'
    Assert-Case (-not (Test-Path -LiteralPath (Join-Path $source "prueba.txt"))) 'Synthetic source transferred'
    Assert-Case ((Get-FileHash -LiteralPath (Join-Path $target "prueba (2).txt")).Hash -eq $sourceHash) 'Transferred file retains its hash'
    Assert-Case ((Get-FileHash -LiteralPath (Join-Path $target "prueba.txt")).Hash -eq $existingHash) 'Existing file is never overwritten'
    Assert-Case (Test-Path -LiteralPath (Join-Path $source ".syncthing.prueba.tmp")) 'Incomplete download is preserved'
    Assert-Case (Test-Path -LiteralPath (Join-Path $source ".stignore")) 'Syncthing metadata is preserved'

    $result = Run-Hidden @('-RutaBuzon', (Join-Path $root "missing"), '-RutaNube', $cloud)
    Assert-Case ($result -eq 1) 'PowerShell failure is propagated to the launcher exit code'
    Assert-Case ([bool](Select-String -LiteralPath (Join-Path $logDir "mover-buzon.log") -Pattern 'FALLO:')) 'Failure is still logged'
    Write-Output "$passed checks passed; no real mailbox or scheduled task touched."
} finally {
    $env:LOCALAPPDATA = $originalLocalAppData
    $resolved = [IO.Path]::GetFullPath($root)
    if ((Split-Path -Parent $resolved) -ne $tempParent -or (Split-Path -Leaf $resolved) -notlike 'clarvex-buzon-test-*') {
        throw 'Refusing cleanup outside the dedicated temporary test directory.'
    }
    if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
