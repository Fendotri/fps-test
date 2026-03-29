$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

function Test-CommandExists {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

if (-not (Test-CommandExists 'ngrok.exe') -and -not (Test-CommandExists 'ngrok')) {
    throw 'ngrok bulunamadi. Once `winget install --id Ngrok.Ngrok -e` calistirin.'
}

if (-not (Test-Path (Join-Path $projectRoot 'node_modules'))) {
    Write-Host 'node_modules bulunamadi. npm install calistiriliyor...' -ForegroundColor Yellow
    npm.cmd install
}

$backendCommand = "Set-Location '$projectRoot'; npm.cmd run backend:dev"
$frontendCommand = "Set-Location '$projectRoot'; npm.cmd run dev -- --host 0.0.0.0"
$ngrokCommand = "Set-Location '$projectRoot'; ngrok http 5173"

Write-Host ''
Write-Host 'Forbox ngrok dev oturumu baslatiliyor...' -ForegroundColor Cyan
Write-Host '1. Backend aciliyor' -ForegroundColor Gray
Write-Host '2. Frontend aciliyor' -ForegroundColor Gray
Write-Host '3. ngrok tüneli aciliyor' -ForegroundColor Gray
Write-Host ''
Write-Host 'Not: once `ngrok config add-authtoken <TOKEN>` yapilmis olmali.' -ForegroundColor Yellow
Write-Host 'Public URL icin ngrok penceresindeki `Forwarding` satirini kullanin.' -ForegroundColor Yellow
Write-Host ''

Start-Process powershell -ArgumentList @(
    '-NoExit',
    '-Command',
    "`$Host.UI.RawUI.WindowTitle = 'FORBOX Backend'; $backendCommand"
)

Start-Sleep -Milliseconds 700

Start-Process powershell -ArgumentList @(
    '-NoExit',
    '-Command',
    "`$Host.UI.RawUI.WindowTitle = 'FORBOX Frontend'; $frontendCommand"
)

Start-Sleep -Milliseconds 1400

Start-Process powershell -ArgumentList @(
    '-NoExit',
    '-Command',
    "`$Host.UI.RawUI.WindowTitle = 'FORBOX ngrok'; $ngrokCommand"
)

Write-Host 'Uc ayri PowerShell penceresi acildi.' -ForegroundColor Cyan
Write-Host "Oyunu paylasmak icin ngrok penceresindeki https URL'sini diger oyuncuya gonderin." -ForegroundColor Green
