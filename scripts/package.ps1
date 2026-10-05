$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ManifestPath = Join-Path $Root "manifest.json"
$Manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
$Version = $Manifest.version

$RuntimeFiles = @(
    "manifest.json",
    "background.js",
    "content.js",
    "offscreen.html",
    "offscreen.js",
    "editor.html",
    "editor.css",
    "editor.js"
)

foreach ($File in $RuntimeFiles) {
    $Path = Join-Path $Root $File
    if (-not (Test-Path $Path)) {
        throw "Missing runtime file: $File"
    }
}

$Dist = Join-Path $Root "dist"
New-Item -ItemType Directory -Force -Path $Dist | Out-Null

$Stage = Join-Path ([System.IO.Path]::GetTempPath()) ("clippah-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $Stage | Out-Null

try {
    foreach ($File in $RuntimeFiles) {
        Copy-Item (Join-Path $Root $File) (Join-Path $Stage $File)
    }

    $Zip = Join-Path $Dist ("Clippah-v$Version.zip")
    if (Test-Path $Zip) {
        Remove-Item $Zip -Force
    }

    Compress-Archive -Path (Join-Path $Stage "*") -DestinationPath $Zip -Force
    Write-Host "Created: $Zip"
}
finally {
    Remove-Item $Stage -Recurse -Force -ErrorAction SilentlyContinue
}
