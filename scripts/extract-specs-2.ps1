param(
  [Parameter(Mandatory=$true, HelpMessage='Path to the VS Code Copilot chat-session-resources folder to search')]
  [string]$root,
  [string]$outDir = (Join-Path $PSScriptRoot '..\reports\specs')
)
$ids = @('toolu_vrtx_018TKDZaXAXSrknhr6rar7y1','toolu_vrtx_01T9YavVY5YwEBwNVVKSBrvo','toolu_vrtx_01A8czPzd7qjWej7S3aijZVR')
foreach ($id in $ids) {
  $dir = Get-ChildItem $root -Directory -Filter "$id*" | Select-Object -First 1
  if (-not $dir) { Write-Host "NO_DIR: $id"; continue }
  $f = Join-Path $dir.FullName 'content.txt'
  $raw = Get-Content $f -Raw
  $idx = $raw.IndexOf("# Area Spec:")
  if ($idx -lt 0) { Write-Host "NO_HEADER: $id"; continue }
  $body = $raw.Substring($idx)
  # Determine destination file from header
  if ($body -match '^# Area Spec:\s*(\S+)') {
    $area = $matches[1]
    $dst = Join-Path $outDir ($area + '.md')
  } else { Write-Host "NO_AREA_NAME: $id"; continue }
  Set-Content -Path $dst -Value $body -Encoding UTF8 -NoNewline
  Write-Host ("WROTE: " + $area + '.md  (' + $body.Length + ' chars)')
}
# Re-run tail trimmer
& powershell -NoProfile -ExecutionPolicy Bypass -File scripts\trim-spec-tails.ps1
Write-Host '---'
Get-ChildItem $outDir -File | Select-Object Name, Length
