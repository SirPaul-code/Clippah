$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Manifest = Get-Content (Join-Path $Root "manifest.json") -Raw | ConvertFrom-Json
$Version = $Manifest.version

$RuntimeFiles = @((Get-Content (Join-Path $Root 'runtime-files.json') -Raw | ConvertFrom-Json).files)

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
