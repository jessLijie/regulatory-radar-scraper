param([switch]$Stop)

$ErrorActionPreference = 'Stop'
$radarRoot = Split-Path -Parent $PSScriptRoot
$radarServer = Join-Path $PSScriptRoot 'server.mjs'
$radarRuntime = Join-Path $radarRoot '.local-runtime'
$radarNode = (Get-Command node -CommandType Application | Select-Object -First 1).Source
$radarUrl = 'http://127.0.0.1:5180'

# Match the executable AND this checkout's exact quoted server path. Never stop
# an unrelated Node process, Ollama, or an app that merely occupies the port.
$radarProcesses = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object {
        $_.ExecutablePath -eq $radarNode -and
        $_.CommandLine -match ('\s' + [regex]::Escape('"' + $radarServer + '"') + '\s*$')
    })

if ($Stop) {
    if ($radarProcesses.Count -eq 0) {
        Write-Host 'No Regulatory Radar background app was found for this checkout.'
        exit 0
    }
    foreach ($radarProcess in $radarProcesses) {
        Stop-Process -Id $radarProcess.ProcessId
    }
    Write-Host 'Regulatory Radar background app stopped. Ollama was left unchanged.'
    exit 0
}

if ($radarProcesses.Count -gt 0) {
    Write-Host "Regulatory Radar is already running: $radarUrl"
    exit 0
}
if (-not (Test-Path -LiteralPath (Join-Path $radarRoot 'dist-local/index.html'))) {
    throw 'Build the app first with npm run build:local.'
}
if (Get-NetTCPConnection -State Listen -LocalPort 5180 -ErrorAction SilentlyContinue) {
    throw 'Port 5180 is already in use. Stop the existing foreground app before starting the background app.'
}

New-Item -ItemType Directory -Force -Path $radarRuntime | Out-Null
$radarProcess = Start-Process -FilePath $radarNode `
    -ArgumentList ('"' + $radarServer + '"') `
    -WorkingDirectory $radarRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $radarRuntime 'server.log') `
    -RedirectStandardError (Join-Path $radarRuntime 'server-error.log')

for ($radarAttempt = 0; $radarAttempt -lt 20; $radarAttempt++) {
    if ($radarProcess.HasExited) { break }
    try {
        $radarResponse = Invoke-WebRequest "$radarUrl/" -UseBasicParsing -TimeoutSec 2
        if ($radarResponse.StatusCode -eq 200) {
            Write-Host "Regulatory Radar is running in the background: $radarUrl"
            Write-Host 'You can close this terminal. To stop the app: npm run local:stop'
            exit 0
        }
    } catch {
        Start-Sleep -Milliseconds 500
    }
}
throw "The app did not start. See $radarRuntime/server-error.log for details."
