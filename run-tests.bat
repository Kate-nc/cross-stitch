@echo off
cd /d "c:\Users\katie\Documents\Code\cross-stitch"
echo === RUNNING: node build-creator-bundle.js ===
call node build-creator-bundle.js
if errorlevel 1 (
  echo === BUILD FAILED ===
) else (
  echo === BUILD COMPLETED SUCCESSFULLY ===
)
echo.
echo === RUNNING: node node_modules/.bin/jest ===
call node node_modules/.bin/jest 2>&1
if errorlevel 1 (
  echo === TESTS FAILED ===
) else (
  echo === TESTS PASSED ===
)
