#!/usr/bin/env node
// packages/connectors/scripts/run-fixture.js
//
// CLI for running a single fixture interactively (verbose stdout).
// Usage: node scripts/run-fixture.js <path-to-fixture.json>

import { loadFixture, runFixture, checkExpectations } from '../tests/fixture-runner.js';

const fixturePath = process.argv[2];
if (!fixturePath) {
  console.error('Usage: node scripts/run-fixture.js <path-to-fixture.json>');
  process.exit(1);
}

const fixture = await loadFixture(fixturePath);
console.log(`Running fixture: ${fixture.name}`);
const result = await runFixture(fixture);

if (result.skipped) {
  console.log(`SKIPPED: ${result.reason}`);
  process.exit(0);
}

console.log('--- Result ---');
console.log(`finalControlAction: ${result.finalControlAction}`);
if (result.finalControlError) console.log(`error: ${result.finalControlError}`);
console.log(`totalRecords: ${result.totalRecords}`);
console.log(`durationMs: ${result.durationMs}`);
console.log(`nodesProcessed: ${result.nodesProcessed}`);
console.log(`storageRecords:`, result.storageRecords);
console.log(`lastState:`, result.lastState);

if (result.errorLogs.length > 0) {
  console.log('--- Error logs ---');
  for (const e of result.errorLogs) console.log(`[${e.level}] ${e.message}`);
}
if (result.runError) {
  console.log('--- Run threw ---');
  console.log(result.runError.stack);
}

const failures = checkExpectations(fixture, result);
if (failures.length > 0) {
  console.log('--- Failures ---');
  for (const f of failures) console.log(` - ${f}`);
  process.exit(1);
}
console.log('--- All expectations met ---');
