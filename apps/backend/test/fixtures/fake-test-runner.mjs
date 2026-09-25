import process from 'node:process';
import { setInterval } from 'node:timers';

const MARKER = '__OW_ROW__';
if (process.env.FAKE_IGNORE_SIGTERM === '1') {
  // A runner that installs its own SIGTERM listener, which suppresses the OS default of
  // terminating on the signal. Nothing in the shipped runner does this today, so this
  // fixture is what keeps the escalation path honest: without it, "the child was asked to
  // stop" and "the child stopped" are indistinguishable.
  process.on('SIGTERM', () => {});
  setInterval(() => {}, 1000);
} else if (process.env.FAKE_HANG === '1') {
  setInterval(() => {}, 1000);
} else if (process.env.FAKE_EXIT_CODE) {
  // Simulate a non-zero exit with no rows (or some rows if FAKE_EXIT_ROWS is set)
  const exitCode = parseInt(process.env.FAKE_EXIT_CODE, 10);
  const fakeRows = parseInt(process.env.FAKE_EXIT_ROWS || '0', 10);
  for (let i = 0; i < fakeRows; i++) {
    process.stdout.write(`${MARKER}${JSON.stringify({ i })}\n`);
  }
  process.exit(exitCode);
} else if (process.env.FAKE_ERROR_LOG === '1') {
  // A hard per-account failure is LOGGED at error level; the runner still exits 0 with
  // 0 rows — the misleading "success, 0 rows" case.
  process.stdout.write(
    JSON.stringify({
      type: 'LOG',
      level: 'error',
      message: 'Error processing account acct-1: HTTP 500: Internal Server Error',
    }) + '\n'
  );
  process.exit(0);
} else if (process.env.FAKE_SKIPPED === '1') {
  // What the engine really emits for a wrong API key: a 401 is a skip, logged at WARN,
  // and the run's verdict is a flagged error, so it arrives as a stderr WARNING envelope
  // with no CONTROL failed. The runner exits 0.
  process.stdout.write(
    JSON.stringify({ type: 'LOG', level: 'warn', message: 'Skipped: HTTP 401: Unauthorized' }) +
      '\n'
  );
  process.stderr.write(
    JSON.stringify({
      type: 'addWarningToCurrentStatus',
      at: new Date().toISOString(),
      warning: 'Nothing was imported because access was refused: HTTP 401: Unauthorized',
    }) + '\n'
  );
  process.exit(0);
} else if (process.env.FAKE_RUN_FAILED === '1') {
  // A run that fails before any account is attempted (a missing required parameter):
  // CONTROL failed on stdout, the error envelope with its stack on stderr, exit 0.
  const message =
    "Unable to load the configuration. The parameter 'ApiKey' is required but was provided with an empty value";
  process.stdout.write(
    JSON.stringify({ type: 'CONTROL', action: 'failed', error: message }) + '\n'
  );
  process.stderr.write(
    JSON.stringify({
      type: 'error',
      at: new Date().toISOString(),
      error: `Error: ${message}\n    at AbstractContext.validate (AbstractContext.js:1:1)`,
    }) + '\n'
  );
  process.exit(0);
} else if (process.env.FAKE_CRASH === '1') {
  // The runner fails before the engine starts, so only the stderr envelope exists.
  process.stderr.write(
    JSON.stringify({
      type: 'error',
      at: new Date().toISOString(),
      error:
        'Error: Source class "XSource" not found and no declarative manifest for "X"\n    at main (connector-runner.js:1:1)',
    }) + '\n'
  );
  process.exit(0);
} else if (process.env.FAKE_SAMPLE_NO_ROWS === '1') {
  // Simulate a wrong recordPath: a raw SAMPLE is received but 0 records are
  // extracted, the run still exits 0 (no error). The classic silent 0-rows bug.
  process.stdout.write(
    JSON.stringify({
      type: 'SAMPLE',
      records: [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
      ],
    }) + '\n'
  );
  process.stdout.write('starting fake run\n');
  process.exit(0);
} else if (process.env.FAKE_MALFORMED_ROW === '1') {
  // Emit a malformed marker line (invalid JSON after the marker), then a valid row, then exit 0
  process.stdout.write('starting fake run\n');
  process.stdout.write(`${MARKER}not-valid-json\n`);
  process.stdout.write(`${MARKER}${JSON.stringify({ i: 0 })}\n`);
  process.exit(0);
} else if (process.env.FAKE_HUGE_LINE === '1') {
  // One output line far larger than the captured-line cap on each stream, followed by
  // ordinary output. A connector echoes responses from an API we do not control, so an
  // unbounded line is reachable in production; this is what the per-line cap is for.
  // Deliberately no process.exit(): 1MB+ does not fit the pipe buffer, and exiting here
  // would truncate the write before the parent ever sees it.
  const huge = 'x'.repeat(1024 * 1024 + 5000);
  process.stdout.write(`${huge}\n`);
  process.stderr.write(`${huge}\n`);
  process.stdout.write('starting fake run\n');
  process.stdout.write(`${MARKER}${JSON.stringify({ i: 0 })}\n`);
} else {
  const cfg = process.env.OW_CONFIG ? JSON.parse(process.env.OW_CONFIG) : {};
  const fields = cfg?.source?.config?.Fields?.value ?? '';
  process.stdout.write(`fields=${fields}\n`);
  process.stdout.write(
    JSON.stringify({ type: 'SAMPLE', records: [{ id: 1, name: 'a', nested: { k: 'v' } }] }) + '\n'
  );
  const n = parseInt(process.env.OW_TEST_MAX_ROWS || '3', 10);
  process.stdout.write('starting fake run\n');
  for (let i = 0; i < n + 5; i++) {
    process.stdout.write(`${MARKER}${JSON.stringify({ i })}\n`);
  }
  process.exit(0);
}
