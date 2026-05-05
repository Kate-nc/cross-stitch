$root = 'C:\Users\katie\AppData\Roaming\Code\User\workspaceStorage\e30ff4a3c75ded98e0e201d5ab620317\GitHub.copilot-chat\chat-session-resources\71d2c6ee-0317-42a0-8113-526ae7adf813'
$outDir = 'C:\Users\katie\Documents\Code\cross-stitch\reports\cross-cutting'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

# Map header text -> filename slug
$slugMap = @{
  'Navigation & Routing' = 'navigation'
  'Authentication & Session Lifecycle' = 'auth-session'
  'Data Flow & State Consistency' = 'data-flow'
  'Error Handling & Recovery' = 'error-handling'
  'Loading, Empty, & Partial States' = 'loading-empty-states'
  'Responsive & Multi-Device Behaviour' = 'responsive'
  'Notifications, Toasts, & Feedback' = 'feedback'
  'Keyboard, Focus, & Accessibility' = 'keyboard-a11y'
}

$dirs = Get-ChildItem $root -Directory
foreach ($dir in $dirs) {
  $f = Join-Path $dir.FullName 'content.txt'
  if (-not (Test-Path $f)) { continue }
  $raw = Get-Content $f -Raw
  $idx = $raw.IndexOf("# Cross-Cutting:")
  if ($idx -lt 0) { continue }
  $body = $raw.Substring($idx)
  if ($body -match '^# Cross-Cutting:\s*(.+?)\s*\r?\n') {
    $title = $matches[1].Trim()
    $slug = $slugMap[$title]
    if (-not $slug) { Write-Host "UNKNOWN_TITLE: $title  ($($dir.Name))"; continue }
    # Trim trailing wrapper after final TODO bullet
    $lines = $body -split "`r?`n"
    $lastVer = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
      if ($lines[$i] -match '\bVER-[A-Z0-9_-]+') { $lastVer = $i }
    }
    if ($lastVer -ge 0) {
      $cut = $lastVer
      for ($j = $lastVer + 1; $j -lt $lines.Count -and $j -le $lastVer + 5; $j++) {
        $l = $lines[$j]
        if ($l -match '^\s*$' -or $l -match '^\s+' -or $l -match '^- \[' -or $l -match '^\s*VER-') { $cut = $j } else { break }
      }
      $body = ($lines[0..$cut] -join "`r`n")
    }
    $dst = Join-Path $outDir ($slug + '.md')
    Set-Content -Path $dst -Value $body -Encoding UTF8 -NoNewline
    Write-Host ("WROTE: " + $slug + '.md  (' + $body.Length + ' chars)  from ' + $dir.Name)
  }
}
Write-Host '---'
Get-ChildItem $outDir -File | Select-Object Name, Length
