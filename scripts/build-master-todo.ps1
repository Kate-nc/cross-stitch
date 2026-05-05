param(
  [string]$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)
$out = Join-Path $repo 'reports\00_MASTER_TODO.md'

$specFiles  = Get-ChildItem (Join-Path $repo 'reports\specs') -Filter '*.md' -File | Where-Object { $_.Name -notmatch '^00_' }
$crossFiles = Get-ChildItem (Join-Path $repo 'reports\cross-cutting') -Filter '*.md' -File

$all = @()
foreach ($f in @($specFiles + $crossFiles)) {
  $rel = $f.FullName.Substring($repo.Length + 1) -replace '\\','/'
  $i = 0
  Get-Content $f.FullName | ForEach-Object {
    $i++
    $line = $_
    if ($line -match '^\s*- \[\s*[ x]\s*\]\s*`?(VER-[A-Z0-9_-]+)`?\s*(?:\[(P[0-4])\])?\s*(.*)$') {
      $id = $matches[1]
      $sev = if ($matches[2]) { $matches[2] } else { 'P?' }
      # Strip leading separator chars (em-dash, en-dash, hyphen) and any mojibake variants
      $desc = $matches[3] -replace '^[\s\-\u2013\u2014\u00e2\u20ac\u201c\u201d\u0080-\u009f]+',''
      $desc = $desc.Trim()
      $all += [pscustomobject]@{
        Id = $id
        Severity = $sev
        Description = $desc
        Source = "$rel#L$i"
      }
    }
  }
}

# Detect duplicate IDs (keep one but note duplicates)
$grouped = $all | Group-Object Id
$dupIds = $grouped | Where-Object { $_.Count -gt 1 } | Select-Object -ExpandProperty Name

$sorted = $all | Sort-Object @{Expression={
  switch ($_.Severity) { 'P0' {0} 'P1' {1} 'P2' {2} 'P3' {3} 'P4' {4} default {5} }
}}, Id

# Write doc
$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine('# Master Verification TODO')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('> Phase 3 aggregation. Auto-generated from every Phase 1 area spec and Phase 2')
[void]$sb.AppendLine('> cross-cutting report. Sorted by severity (P0 first), then by ID.')
[void]$sb.AppendLine('> Total items: ' + $all.Count + '. Source files: ' + ($specFiles.Count + $crossFiles.Count) + '.')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('Severity scale (from `reports/00_PROJECT_CONTEXT.md`):')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('- **P0** — Data loss, crash, or workflow blocker')
[void]$sb.AppendLine('- **P1** — Misleads the user or breaks core workflow with workaround')
[void]$sb.AppendLine('- **P2** — Confusing/inconsistent; degrades trust')
[void]$sb.AppendLine('- **P3** — Polish, cosmetic, copy edit')
[void]$sb.AppendLine('- **P4** — Optional enhancement / nice-to-have')
[void]$sb.AppendLine('- **P?** — Severity not annotated in source (audit needed)')
[void]$sb.AppendLine('')

if ($dupIds.Count -gt 0) {
  [void]$sb.AppendLine('## Duplicate IDs (manual reconciliation required)')
  [void]$sb.AppendLine('')
  foreach ($d in $dupIds) {
    [void]$sb.AppendLine('- `' + $d + '` — appears in: ' + (($all | Where-Object Id -eq $d | ForEach-Object { $_.Source }) -join ', '))
  }
  [void]$sb.AppendLine('')
}

$counts = $sorted | Group-Object Severity | ForEach-Object { "$($_.Name)=$($_.Count)" }
[void]$sb.AppendLine('## Counts by severity')
[void]$sb.AppendLine('')
foreach ($c in ($sorted | Group-Object Severity | Sort-Object Name)) {
  [void]$sb.AppendLine('- **' + $c.Name + '** — ' + $c.Count)
}
[void]$sb.AppendLine('')

foreach ($sev in @('P0','P1','P2','P3','P4','P?')) {
  $items = $sorted | Where-Object Severity -eq $sev
  if ($items.Count -eq 0) { continue }
  [void]$sb.AppendLine('## ' + $sev + ' (' + $items.Count + ')')
  [void]$sb.AppendLine('')
  foreach ($it in $items) {
    [void]$sb.AppendLine('- [ ] `' + $it.Id + '` — ' + $it.Description + '  <sub>[' + $it.Source + '](../' + ($it.Source -replace '#L.*','') + ')</sub>')
  }
  [void]$sb.AppendLine('')
}

Set-Content -Path $out -Value $sb.ToString() -Encoding UTF8
Write-Host ('Wrote ' + $out + ' (' + $all.Count + ' items, ' + $dupIds.Count + ' duplicate IDs)')
