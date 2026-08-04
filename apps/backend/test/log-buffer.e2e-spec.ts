import { createLogBuffer } from './utils/log-buffer';

/**
 * Regression for the api-key smoke suite, which timed out waiting for a log line the
 * process had already printed.
 *
 * The magic link is logged around offset 1,200 of roughly 127,000 characters of startup
 * output. A tail-only buffer capped at 120,000 therefore evicted it before the test read
 * it -- consistently on CI, and often enough elsewhere to read as flakiness.
 */
describe('child process log buffer', () => {
  const MARKER = 'Magic link: http://127.0.0.1:1234/auth/magic-link?token=abc';

  it('keeps an early line after later output overflows the cap', () => {
    const buffer = createLogBuffer(200, 1_000);

    buffer.append(`${MARKER}\n`);
    buffer.append('x'.repeat(5_000));

    expect(buffer.read()).toContain(MARKER);
  });

  it('still keeps the most recent output, which is what an exit message needs', () => {
    const buffer = createLogBuffer(200, 1_000);

    buffer.append(`${MARKER}\n`);
    buffer.append('x'.repeat(5_000));
    buffer.append('Nest application closed unexpectedly');

    expect(buffer.read()).toContain('Nest application closed unexpectedly');
  });

  it('says where output was dropped instead of splicing the two ends together', () => {
    const buffer = createLogBuffer(200, 1_000);

    buffer.append('start\n');
    buffer.append('x'.repeat(5_000));

    expect(buffer.read()).toContain('[log truncated]');
  });

  it('reads back verbatim while nothing has overflowed', () => {
    const buffer = createLogBuffer(200, 1_000);

    buffer.append('one\n');
    buffer.append('two\n');

    expect(buffer.read()).toBe('one\ntwo\n');
  });

  // The shape of the real failure: an early marker, then more output than the cap holds.
  it('survives the volume the real startup produces', () => {
    const buffer = createLogBuffer();

    buffer.append('a'.repeat(1_200));
    buffer.append(`${MARKER}\n`);
    buffer.append('b'.repeat(130_000));

    expect(buffer.read()).toContain(MARKER);
  });
});
