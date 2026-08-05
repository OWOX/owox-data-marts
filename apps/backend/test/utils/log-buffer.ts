/** Boot markers -- the primary admin's magic link above all -- land in the first few KB. */
const HEAD_CHARS = 20_000;
const TAIL_CHARS = 120_000;

export interface LogBuffer {
  append(chunk: string): void;
  read(): string;
}

/**
 * Keeps both ends of a child process's output, because its two readers want opposite ends.
 *
 * `waitForLog` asks "did this ever appear", and what it waits for is printed during
 * startup. The exit message asks "what was happening just before it died", which is the
 * tail. Keeping only the tail -- the previous behaviour -- silently dropped the magic link
 * as soon as boot output passed the cap, and boot output sits within a few KB of it: the
 * line is printed around offset 1,200 of roughly 127,000, so it was the first thing
 * evicted. That is why this suite failed on CI and looked flaky everywhere else.
 */
export function createLogBuffer(headChars = HEAD_CHARS, tailChars = TAIL_CHARS): LogBuffer {
  let head = '';
  let tail = '';
  let dropped = false;

  return {
    append(chunk: string): void {
      if (head.length < headChars) {
        head = `${head}${chunk}`.slice(0, headChars);
      }

      tail = `${tail}${chunk}`;
      if (tail.length > tailChars) {
        tail = tail.slice(-tailChars);
        dropped = true;
      }
    },

    read(): string {
      // Once anything is dropped the two ends stop overlapping, so they are joined with a
      // visible gap rather than pretending the output was continuous.
      return dropped ? `${head}\n[log truncated]\n${tail}` : tail;
    },
  };
}
