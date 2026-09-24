import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from './data-layer';
import { isChunkLoadError, trackChunkLoadError } from './chunk-load-error';

vi.mock('./data-layer', () => ({ trackEvent: vi.fn() }));

const CHROME = 'Failed to fetch dynamically imported module: https://app.example/assets/a-1.js';
const FIREFOX = 'error loading dynamically imported module: https://app.example/assets/a-1.js';
const SAFARI = 'Importing a module script failed.';

describe('isChunkLoadError', () => {
  it.each([CHROME, FIREFOX, SAFARI])('recognises the browser message "%s"', message => {
    expect(isChunkLoadError(new Error(message))).toBe(true);
  });

  it('ignores other errors and non-errors', () => {
    expect(isChunkLoadError(new Error('Request failed with status code 500'))).toBe(false);
    expect(isChunkLoadError(CHROME)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe('trackChunkLoadError', () => {
  beforeEach(() => {
    vi.mocked(trackEvent).mockClear();
  });

  it('sends one event with the caller and the browser message', () => {
    const tracked = trackChunkLoadError(new Error(CHROME), 'CanvasExport');

    expect(tracked).toBe(true);
    expect(trackEvent).toHaveBeenCalledWith({
      event: 'chunk_load_error',
      category: 'App',
      action: 'CanvasExport',
      label: CHROME,
    });
  });

  it('sends nothing for an unrelated error', () => {
    const tracked = trackChunkLoadError(new Error('boom'), 'CanvasExport');

    expect(tracked).toBe(false);
    expect(trackEvent).not.toHaveBeenCalled();
  });
});
