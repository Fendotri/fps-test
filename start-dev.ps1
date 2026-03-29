$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

function Get-LocalIPv4 {
    try {
        $fromNet = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object {
                $_.IPAddress -notlike '127.*' -and
                $_.IPAddress -notlike '169.254.*' -and
                $_.PrefixOrigin -ne 'WellKnown'
            } |
            Select-Object -First 1 -ExpandProperty IPAddress
        if ($fromNet) { return $fromNet }
    } catch {
    }

    $ipconfigText = ipconfig
    $match = [regex]::Match($ipconfigText -join [Environment]::NewLine, 'IPv4 Address[^\:]*:\s*(\d+\.\d+\.\d+\.\d+)')
    if ($match.Success) { return $match.Groups[1].Value }

    return 'localhost'
}

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw 'npm.cmd bulunamadi. Node.js / npm kurulu olmali.'
}

if (-not (Test-Path (Join-Path $projectRoot 'node_modules'))) {
    Write-Host 'node_modules bulunamadi. npm install calistiriliyor...' -ForegroundColor Yellow
    npm.cmd install
}

$lanIp = Get-LocalIPv4
$frontendUrl = "http://${lanIp}:5173"
$backendUrl = "http://${lanIp}:8787"

Write-Host ''
Write-Host 'Forbox local dev baslatiliyor...' -ForegroundColor Cyan
Write-Host "Frontend LAN URL : $frontendUrl" -ForegroundColor Green
Write-Host "Backend LAN URL  : $backendUrl" -ForegroundColor Green
Write-Host ''

$backendCommand = "Set-Location '$projectRoot'; npm.cmd run backend:dev"
$frontendCommand = "Set-Location '$projectRoot'; npm.cmd run dev -- --host 0.0.0.0"

Start-Process powershell -ArgumentList @(
    '-NoExit',
    '-Command',
    "`$Host.UI.RawUI.WindowTitle = 'FORBOX Backend'; $backendCommand"
)

Start-Sleep -Milliseconds 600

Start-Process powershell -ArgumentList @(
    '-NoExit',
    '-Command',
    "`$Host.UI.RawUI.WindowTitle = 'FORBOX Frontend'; $frontendCommand"
)

Write-Host 'Iki ayri PowerShell penceresi acildi.' -ForegroundColor Cyan
Write-Host "Diger bilgisayardan giris adresi: $frontendUrl" -ForegroundColor Yellow
