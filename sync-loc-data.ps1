param(
  [string]$Source = "loc.json",
  [string]$Target = "loc-data.js"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Source)) {
  throw "Source file not found: $Source"
}

$jsonText = Get-Content -LiteralPath $Source -Raw -Encoding UTF8
$data = $jsonText | ConvertFrom-Json

$formattedJson = $data | ConvertTo-Json -Depth 100
$js = "window.__LOC_DATA__ = $formattedJson;`n"

Set-Content -LiteralPath $Target -Value $js -Encoding UTF8
Write-Host "Synced $Target from $Source"
