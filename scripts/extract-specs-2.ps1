$ids = @('toolu_vrtx_018TKDZaXAXSrknhr6rar7y1','toolu_vrtx_01T9YavVY5YwEBwNVVKSBrvo','toolu_vrtx_01A8czPzd7qjWej7S3aijZVR')
$root = 'C:\Users\katie\AppData\Roaming\Code\User\workspaceStorage\e30ff4a3c75ded98e0e201d5ab620317\GitHub.copilot-chat\chat-session-resources\71d2c6ee-0317-42a0-8113-526ae7adf813'
$outDir = 'C:\Users\katie\Documents\Code\cross-stitch\reports\specs'
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
