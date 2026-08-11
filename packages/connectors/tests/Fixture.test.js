// packages/connectors/tests/Fixture.test.js
//
// Discovers all *.fixture.json files in tests/fixtures/ and runs each one
// via the fixture runner. Each fixture becomes its own describe() block so
// `node --test` reports them individually.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { discoverFixtures, loadFixture, runFixture, checkExpectations } from './fixture-runner.js';

const fixtures = await discoverFixtures();

if (fixtures.length === 0) {
  describe('Fixture tests', () => {
    it('no fixtures discovered (drop *.fixture.json into tests/fixtures/)', () => {
      // pass - no fixtures to run is OK during dev
    });
  });
} else {
  for (const fixturePath of fixtures) {
    const fixture = await loadFixture(fixturePath);
    const fixtureName = fixture.name || fixturePath.split('/').pop();

    describe(`Fixture: ${fixtureName}`, () => {
      it(
        'runs and meets expectations',
        async t => {
          const result = await runFixture(fixture);
          if (result.skipped) {
            t.skip(result.reason);
            return;
          }
          const failures = checkExpectations(fixture, result);

          if (failures.length > 0) {
            const diagnostics = JSON.stringify(
              {
                finalControlAction: result.finalControlAction,
                finalControlError: result.finalControlError,
                totalRecords: result.totalRecords,
                durationMs: result.durationMs,
                nodesProcessed: result.nodesProcessed,
                lastState: result.lastState,
                errorLogs: result.errorLogs.slice(0, 5),
                runError: result.runError,
              },
              null,
              2
            );
            assert.fail(
              `Fixture failures:\n${failures.map(f => ' - ' + f).join('\n')}\n\nResult:\n${diagnostics}`
            );
          }
        },
        { timeout: 120000 }
      );
    });
  }
}
