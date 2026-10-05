$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Manifest = Get-Content (Join-Path $Root "manifest.json") -Raw | ConvertFrom-Json
$Version = $Manifest.version

$RuntimeFiles = @(
    "manifest.json",
    "background.js",
    "content.js",
    "offscreen.html",
    "offscreen.js",
    "editor.html",
    "editor.css",
    "editor.js",
    "options.html",
    "options.css",
    "options.js",
    "icons/icon-16.png",
    "icons/icon-32.png",
    "icons/icon-48.png",
    "icons/icon-128.png"
)

foreach ($File in $RuntimeFiles) {
    if (-not (Test-Path (Join-Path $Root $File))) { throw "Missing runtime file: $File" }
}

$Dist = Join-Path $Root "dist"
$Stage = Join-Path ([System.IO.Path]::GetTempPath()) ("clippah-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $Dist, $Stage | Out-Null

try {
    foreach ($File in $RuntimeFiles) {
        $Target = Join-Path $Stage $File
        New-Item -ItemType Directory -Force -Path (Split-Path $Target -Parent) | Out-Null
        Copy-Item (Join-Path $Root $File) $Target
    }
    $Zip = Join-Path $Dist ("Clippah-v$Version.zip")
    if (Test-Path $Zip) { Remove-Item $Zip -Force }
    Compress-Archive -Path (Join-Path $Stage "*") -DestinationPath $Zip -Force
    Write-Host "Created: $Zip"
}
finally {
    Remove-Item $Stage -Recurse -Force -ErrorAction SilentlyContinue
}
