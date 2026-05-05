param(
  [Parameter(Mandatory=$true, HelpMessage='Path to the VS Code Copilot chat-session-resources folder to search')]
  [string]$resourceDir,
  [string]$outDir = (Join-Path $PSScriptRoot '..\reports\specs')
)
$map = @{
  'toolu_vrtx_012TbmNxRPoKwgvZEuWCdxEC' = 'manager.md'
  'toolu_vrtx_014GDXb48oeCt1NtxNwruzm1' = 'creator-pattern-canvas.md'
  'toolu_vrtx_01BWiGVVs643pg6XprKLtpwf' = 'creator-modals.md'
  'toolu_vrtx_01KdyQkPiKNT1f11iKbxjnBP' = 'tracker.md'
  'toolu_vrtx_01M2s5sCyeMym4rZPmMww5jp' = 'creator-legend-export.md'
}
foreach ($k in $map.Keys) {
  $dir = Get-ChildItem $resourceDir -Directory -Filter "$k*" | Select-Object -First 1
  if (-not $dir) { Write-Host "MISSING_DIR: $k"; continue }
  $src = Join-Path $dir.FullName 'content.txt'
  if (-not (Test-Path $src)) { Write-Host "MISSING_FILE: $src"; continue }
  $raw = Get-Content $src -Raw
  $idx = $raw.IndexOf("# Area Spec:")
  if ($idx -lt 0) { Write-Host "NO_HEADER: $src"; continue }
  $body = $raw.Substring($idx)
  $fence = '```' + '`' + '`' + '`'   # construct ``````
  $idx2 = $body.LastIndexOf($fence)
  if ($idx2 -lt 0) {
    $idx2 = $body.LastIndexOf("``````")
  }
  if ($idx2 -gt 0 -and $idx2 -gt ($body.Length - 500)) {
    $body = $body.Substring(0, $idx2).TrimEnd()
  }
  # Also strip closing </details> wrapper if present
  $body = $body -replace '</details>\s*$',''
  $dst = Join-Path $outDir $map[$k]
  Set-Content -Path $dst -Value $body -Encoding UTF8 -NoNewline
  Write-Host ("WROTE: " + $map[$k] + "  (" + $body.Length + " chars)")
}
