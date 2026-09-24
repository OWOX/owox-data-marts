import { expect, it } from 'vitest';
import { hasStaleChunk, watchForStaleChunk } from './stale-chunk';

// The flag is module-global and never resets, so this file holds a single test.
it('remembers a failed chunk and lets the import reject', () => {
  expect(hasStaleChunk()).toBe(false);
  watchForStaleChunk();

  const event = new Event('vite:preloadError', { cancelable: true });
  window.dispatchEvent(event);

  expect(hasStaleChunk()).toBe(true);
  expect(event.defaultPrevented).toBe(false);
});
