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
  // Simulate a per-account error (e.g. auth 401) that is LOGGED at error level
  // but the run still exits 0 with 0 rows — the misleading "success, 0 rows" case.
  process.stdout.write(JSON.stringify({ type: 'LOG', level: 'error', message: 'Error processing account acct-1: HTTP 401: Unauthorized — api key doesn\'t match' }) + '\n');
  process.exit(0);
} else if (process.env.FAKE_SAMPLE_NO_ROWS === '1') {
  // Simulate a wrong recordPath: a raw SAMPLE is received but 0 records are
  // extracted, the run still exits 0 (no error). The classic silent 0-rows bug.
  process.stdout.write(JSON.stringify({ type: 'SAMPLE', records: [{ id: 1, name: 'a' }, { id: 2, name: 'b' }] }) + '\n');
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
  process.stdout.write(JSON.stringify({ type: 'SAMPLE', records: [{ id: 1, name: 'a', nested: { k: 'v' } }] }) + '\n');
  const n = parseInt(process.env.OW_TEST_MAX_ROWS || '3', 10);
  process.stdout.write('starting fake run\n');
  for (let i = 0; i < n + 5; i++) {
    process.stdout.write(`${MARKER}${JSON.stringify({ i })}\n`);
  }
  process.exit(0);
}
