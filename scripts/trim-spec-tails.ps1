# Trim trailing agent commentary from spec files.
# Strategy: find last "- [ ] `VER-" line; allow a few subsequent
# bullet lines or blank lines, then cut everything after the last
# bullet that fits the VER- pattern OR a few tolerated trailing lines.

$specs = Get-ChildItem reports\specs -File -Filter *.md | Where-Object Name -ne '00_INTERFACE_MAP.md'
foreach ($f in $specs) {
  $lines = Get-Content $f.FullName
  # find the last line that looks like a VER- todo bullet OR a tolerated continuation
  $lastVer = -1
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '\bVER-[A-Z0-9_-]+') { $lastVer = $i }
  }
  if ($lastVer -lt 0) { Write-Host "NO_VER: $($f.Name)"; continue }
  # Allow a small tail: continuation indents, trailing blanks, or "## Summary" inside spec
  # but cut anything that looks like agent commentary
  $cut = $lastVer
  for ($j = $lastVer + 1; $j -lt $lines.Count -and $j -le $lastVer + 5; $j++) {
    $l = $lines[$j]
    if ($l -match '^\s*$' -or $l -match '^\s+' -or $l -match '^- \[' -or $l -match '^\s*VER-') {
      $cut = $j
    } else { break }
  }
  $kept = $lines[0..$cut]
  Set-Content -Path $f.FullName -Value $kept -Encoding UTF8
  Write-Host ("TRIMMED: " + $f.Name + "  kept " + ($cut + 1) + " of " + $lines.Count + " lines")
}
