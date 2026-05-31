@echo off
REM Build, test, commit and push the speckle-fix changes.
REM Run from the repo root or double-click — it will cd automatically.

cd /d "%~dp0"

echo === Building creator bundle ===
node build-creator-bundle.js
if errorlevel 1 (echo BUILD FAILED & pause & exit /b 1)

echo.
echo === Running tests ===
npm test
if errorlevel 1 (echo TESTS FAILED & pause & exit /b 1)

echo.
echo === Staging changed files ===
git add creator/generate.js creator/useCreatorState.js creator/usePreview.js creator/bundle.js tests/prescaleForGrid.test.js

echo.
echo === Writing commit message ===
(
  echo fix: area-average downscale to eliminate photo-conversion speckle noise
  echo.
  echo Root cause
  echo ----------
  echo canvas drawImage with imageSmoothingQuality='low' ^(browser default^) at
  echo ~20:1 reduction samples only ~4 source pixels per output stitch, discarding
  echo ~396 of every 400 pixels.  Each stitch inherits whatever single pixel landed
  echo under it: outline pixels become black speckles, edge-background pixels become
  echo stray dots.  Palette-snapping then faithfully maps each noise pixel to its own
  echo floss colour, multiplying the chaos.
  echo.
  echo Fix
  echo ---
  echo prescaleForGrid^(^) halves the image in 2:1 steps until within 2x of the
  echo target.  At each 2:1 step bilinear sampling covers every source pixel
  echo ^(equivalent to area averaging^), so the chain produces a clean mean for any
  echo reduction ratio.  imageSmoothingEnabled=true and imageSmoothingQuality='high'
  echo are set explicitly on every intermediate and final canvas context.
  echo Returns source unchanged when the ratio is already ^<=2:1 ^(no canvas created^).
  echo.
  echo Code paths changed
  echo ------------------
  echo creator/generate.js         runGenerationPipeline ^(main-thread fallback^)
  echo creator/useCreatorState.js  startGeneration ^(web-worker path, normal flow^)
  echo creator/usePreview.js       generatePreview ^(preview thumbnail^)
  echo.
  echo prescaleForGrid is defined once at the top of generate.js, which is first in
  echo the bundle ORDER, so it is in scope for all three callers without a window.*
  echo assignment.
  echo.
  echo Order of operations
  echo -------------------
  echo area-average downscale  ^>  optional smoothing  ^>  OKLab k-means++ quantise
  echo  ^>  Lab/dE2 palette snap.  No other pipeline stage is touched.
  echo.
  echo Tests
  echo -----
  echo tests/prescaleForGrid.test.js covers: no-op at ^<=2:1, single 2:1 step ^(4:1
  echo source^), multi-step chain ^(20:1^), asymmetric source, non-divisible grid
  echo ^(1000-^>47^), smoothing-setting assertions on every intermediate canvas, and
  echo source-level assertions confirming all three callers use prescaleForGrid.
  echo.
  echo Out of scope ^(deliberate^)
  echo -------------------------
  echo - import-formats.js image-import path: separate fix
  echo - Lab-^>OKLab migration for legacy quantize^(^): already using OKLab+dE2 in
  echo   quantizeConstrained; legacy path is left for a dedicated follow-up
  echo.
  echo Co-authored-by: Copilot ^<223556219+Copilot@users.noreply.github.com^>
) > .git\COMMIT_EDITMSG_SPECKLE.txt

echo === Committing ===
git commit -F .git\COMMIT_EDITMSG_SPECKLE.txt
if errorlevel 1 (echo COMMIT FAILED & pause & exit /b 1)

echo.
echo === Pushing ===
git push
if errorlevel 1 (echo PUSH FAILED & pause & exit /b 1)

echo.
echo Done — speckle-fix committed and pushed.
pause
