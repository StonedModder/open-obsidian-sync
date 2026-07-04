$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root "resources\rclone"
$exe = Join-Path $target "rclone.exe"

if (Test-Path $exe) {
  Write-Host "rclone already exists at $exe"
  exit 0
}

New-Item -ItemType Directory -Force -Path $target | Out-Null

$zip = Join-Path $env:TEMP "rclone-current-windows-amd64.zip"
$extract = Join-Path $env:TEMP "open-obsidian-sync-rclone"

if (Test-Path $extract) {
  Remove-Item -LiteralPath $extract -Recurse -Force
}

Write-Host "Downloading rclone..."
Invoke-WebRequest -Uri "https://downloads.rclone.org/rclone-current-windows-amd64.zip" -OutFile $zip
Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force

$downloaded = Get-ChildItem -Path $extract -Recurse -Filter "rclone.exe" | Select-Object -First 1
if (-not $downloaded) {
  throw "rclone.exe was not found in the downloaded archive."
}

Copy-Item -LiteralPath $downloaded.FullName -Destination $exe -Force
Write-Host "rclone installed at $exe"
