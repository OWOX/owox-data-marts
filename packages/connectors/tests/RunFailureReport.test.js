import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RunFailureReport } from '../src/Core/RunFailureReport.js';

// This envelope is the terminal consumer of every `isWarning` flag the sources
// set. The backend parses it against MessageWarningSchema / MessageErrorSchema,
// which require the message under `warning` / `error` respectively; emitting it
// under the wrong key downgrades the run to an unknown message and the reason
// never reaches run history.
describe('RunFailureReport.toEnvelope', () => {
  it('reports a flagged failure as a warning, carrying just the message', () => {
    const error = Object.assign(new Error('Ad account access was revoked'), {
      isWarning: true,
    });

    const envelope = RunFailureReport.toEnvelope(error);

    assert.equal(envelope.type, 'addWarningToCurrentStatus');
    assert.equal(envelope.warning, 'Ad account access was revoked');
    assert.equal('error' in envelope, false);
    assert.equal(typeof envelope.at, 'string');
  });

  // A warning is customer-facing and fully described by its message; the stack
  // would crowd out the readable part in failure emails, which show only the
  // first 300 characters.
  it('omits the stack from a warning', () => {
    const error = Object.assign(new Error('Spreadsheet is no longer shared'), {
      isWarning: true,
    });

    assert.equal(RunFailureReport.toEnvelope(error).warning.includes('at '), false);
  });

  it('reports an unflagged failure as an error, with the stack for diagnosis', () => {
    const error = new Error('Cannot read properties of undefined');

    const envelope = RunFailureReport.toEnvelope(error);

    assert.equal(envelope.type, 'error');
    assert.match(envelope.error, /Cannot read properties of undefined/);
    assert.match(envelope.error, /at /);
    assert.equal('warning' in envelope, false);
  });

  // `isWarning` is set by classification code that may be absent or stale, so
  // only an exact `true` promotes — a truthy stand-in must not silence an alert.
  it('treats a non-boolean isWarning as unflagged', () => {
    const error = Object.assign(new Error('boom'), { isWarning: 'yes' });

    assert.equal(RunFailureReport.toEnvelope(error).type, 'error');
  });

  it('survives a thrown non-Error', () => {
    const envelope = RunFailureReport.toEnvelope('connector exited unexpectedly');

    assert.equal(envelope.type, 'error');
    assert.equal(envelope.error, 'connector exited unexpectedly');
  });

  it('survives a thrown null', () => {
    const envelope = RunFailureReport.toEnvelope(null);

    assert.equal(envelope.type, 'error');
    assert.equal(envelope.error, 'null');
  });
});
