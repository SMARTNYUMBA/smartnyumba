'use strict';

// Run each test file in its own Node process. Several regression tests replace
// require.cache entries for the database pool; isolating files prevents one
// test file from accidentally changing another file's mocked dependencies.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const files = fs.readdirSync(__dirname)
  .filter(f => f.endsWith('.test.js'))
  .sort()
  .map(f => path.join(__dirname, f));

let failed = 0;
for (const file of files) {
  console.log(`\n=== ${path.basename(file)} ===`);
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', file], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) failed++;
}
process.exit(failed ? 1 : 0);
