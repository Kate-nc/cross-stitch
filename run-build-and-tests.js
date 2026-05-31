#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');

const cwd = path.resolve(__dirname);

console.log('='.repeat(70));
console.log('STEP 1: Building creator bundle');
console.log('='.repeat(70));

try {
  execSync('node build-creator-bundle.js', {
    stdio: 'inherit',
    cwd,
    shell: true
  });
  console.log('\n✓ Build completed successfully\n');
} catch (e) {
  console.error('\n✗ Build failed');
  process.exit(1);
}

console.log('='.repeat(70));
console.log('STEP 2: Running Jest tests');
console.log('='.repeat(70));

try {
  execSync('node node_modules/.bin/jest', {
    stdio: 'inherit',
    cwd,
    shell: true
  });
  console.log('\n✓ Tests completed successfully\n');
} catch (e) {
  console.error('\n✗ Tests failed with exit code:', e.status);
  process.exit(e.status || 1);
}
