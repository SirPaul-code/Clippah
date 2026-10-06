$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Here

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
}

Write-Host ""
Write-Host "Clippah Agent setup" -ForegroundColor Cyan
Write-Host "===================" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host "Node.js is missing. Installing Node.js LTS with winget..."
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    Refresh-Path
  } else {
    Write-Host "Node.js 20+ is required and winget is not available." -ForegroundColor Yellow
    Write-Host "Install Node.js LTS from https://nodejs.org and run setup.cmd again."
    Start-Process "https://nodejs.org/en/download"
    Read-Host "Press Enter to close"
    exit 1
  }
}

$versionText = node --version
Write-Host "Using Node $versionText"

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Refresh-Path
}

Write-Host "Installing local MCP dependencies..."
npm install --omit=dev

$token = (node server.js --print-token).Trim()
try { Set-Clipboard -Value $token } catch {}

Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host "Pairing token (also copied to clipboard):" -ForegroundColor White
Write-Host $token -ForegroundColor Yellow
Write-Host ""
Write-Host "In Chrome: Clippah -> Settings -> Agent Bridge"
Write-Host "1. Enable Agent Bridge"
Write-Host "2. Paste the token"
Write-Host "3. Save"
Write-Host ""
Write-Host "For an MCP-capable agent, use this launcher as the MCP command:" -ForegroundColor White
Write-Host (Join-Path $Here "clippah-mcp.cmd") -ForegroundColor Cyan
Write-Host ""
Read-Host "Press Enter to close"
