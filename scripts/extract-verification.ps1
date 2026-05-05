$root = 'C:\Users\katie\AppData\Roaming\Code\User\workspaceStorage\e30ff4a3c75ded98e0e201d5ab620317\GitHub.copilot-chat\chat-session-resources\71d2c6ee-0317-42a0-8113-526ae7adf813'
$outDir = 'C:\Users\katie\Documents\Code\cross-stitch\reports\verification'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

$slugMap = @{
  'P0 Verification: Navigation & Redirects' = 'p0-navigation.md'
  'P0 Verification: Service Worker & Home' = 'p0-sw-home.md'
  'P0 Verification: Manager' = 'p0-manager.md'
  'P0 Verification: Creator Legend/Export' = 'p0-creator-export.md'
  'VER-CONF-007: Emoji Audit' = 'ver-conf-007-emoji-audit.md'
}

$dirs = Get-ChildItem $root -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 12
foreach ($dir in $dirs) {
  $f = Join-Path $dir.FullName 'content.txt'
  if (-not (Test-Path $f)) { continue }
  $raw = Get-Content $f -Raw
  foreach ($title in $slugMap.Keys) {
    $marker = "# $title"
    $idx = $raw.IndexOf($marker)
    if ($idx -lt 0) { continue }
    $body = $raw.Substring($idx)
    $lines = $body -split "`r?`n"
    $cut = $lines.Count - 1
    for ($i = $lines.Count - 1; $i -ge 0; $i--) {
      $l = $lines[$i]
      if ($l -match '^\s*-\s|^\s*\*\*|^#|\bPASS\b|\bFAIL\b|\bPARTIAL\b|^\|') { $cut = $i; break }
    }
    $body = ($lines[0..$cut] -join "`r`n")
    $dst = Join-Path $outDir $slugMap[$title]
    if (-not (Test-Path $dst)) {
      Set-Content -Path $dst -Value $body -Encoding UTF8 -NoNewline
      Write-Host ("WROTE: " + $slugMap[$title] + ' (' + $body.Length + ' chars)')
    }
  }
}
Get-ChildItem $outDir -File | Select-Object Name, Length | Format-Table -AutoSize
